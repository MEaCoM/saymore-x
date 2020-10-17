import * as Path from "path";
import * as child_process from "child_process";
import { sentryBreadCrumb, sentryException } from "./errorHandling";
import { NotifyError } from "./components/Notify";
import filesize from "filesize";
import * as fs from "fs-extra";

export interface ICopyJob {
  process: child_process.ChildProcess;
  destination: string;
  progress: string;
}

const activeJobs: ICopyJob[] = [];

export function getActiveCopyJobs(): ICopyJob[] {
  return activeJobs;
}

export function abandonCopying(cancelJobsFirst: boolean) {
  if (cancelJobsFirst) {
    sentryBreadCrumb("abandonCopying(cancelJobsFirst)");
    activeJobs.forEach((job, index) => {
      try {
        job.process.kill("SIGINT");
        window.setTimeout(() => {
          try {
            if (fs.existsSync(job.destination)) fs.removeSync(job.destination);
          } catch (err) {
            console.error(
              `trying to delete partially-copied file, got: ${JSON.stringify(
                err
              )}`
            );
            sentryException(err);
          }
        }, 100);
      } catch (err) {
        console.error(`cancelling copy, got: ${JSON.stringify(err)}`);
        sentryException(err);
      }
    });
  }
  activeJobs.splice(0, activeJobs.length);
}
export function filesAreStillCopying(): boolean {
  return activeJobs.length > 0;
}
function toWin32Path(path: string): string {
  return path.replace(/\//gi, "\\");
}
// copying large files on mac with node was very flaky. So we now use an external system command instead.
export function safeAsyncCopyFileWithErrorNotification(
  sourcePath: string,
  destPath: string,
  progress?: (msg: string) => void
): Promise<string> {
  const size: string = filesize(fs.statSync(sourcePath).size);
  sentryBreadCrumb(`starting ${sourcePath} to  ${destPath}, ${size}`);

  const cmd =
    process.platform === "win32"
      ? `copy` // windows
      : `rsync`; // mac & linux.

  const args =
    process.platform === "win32"
      ? [`"${toWin32Path(sourcePath)}"`, `"${toWin32Path(destPath)}"`, "/z"] // cp
      : [`"${sourcePath}"`, `"${destPath}"`, "-t", "--progress"]; // rsync verbose, preserve time stamp

  return new Promise<string>((resolve, reject) => {
    // By using spawn, we can get progress during the copy.
    // Note that the copy will continue even if we quit lameta.
    const process: child_process.ChildProcess = child_process.spawn(cmd, args, {
      shell: true,
      detached: true, // without this, if we quit while the copy is going, it will be corrupt
    });
    const job = { process, destination: destPath, progress: "0%" };
    activeJobs.push(job);
    //spawn.unref(); // allow lameta to quit even if this is still going
    const percentage = /(\d+%)/g;
    process.stdout?.on("data", (data: string) => {
      // with large files, we often get, e.g. "copied 1% copied 1%"
      const messages = data.toString().trim();
      const matches = percentage.exec(messages);
      if (matches && matches.length) {
        job.progress = matches[0];
        if (progress) progress(matches[0]);
      }
    });
    process.stderr?.on("data", (data) => {
      NotifyError(`${data.toString()} ${sourcePath}-->${destPath}`);
    });

    process.on("error", (err) => {
      NotifyError(`${err.message} ${sourcePath}-->${destPath}`);
      reject(err.message);
    });
    process.on("close", (code) => {
      const index = activeJobs.findIndex((f) => f.process === process);
      if (index > -1) {
        activeJobs.splice(index, 1);
      }

      if (code) {
        job.progress = "100%";
        const fullmsg = `RobustLargeFileCopy got a code ${code} in the close event while copying ${sourcePath} to ${destPath}, ${size}`;
        console.error(fullmsg);
        sentryBreadCrumb(fullmsg);
        //sentryException(code);
        const msg = `lameta had a problem copying ${sourcePath} to ${destPath}. The call to ${cmd} exited with code ${code}`;
        NotifyError(`${msg}`);
        reject(msg);
      } else {
        console.log(`done copy ${destPath}`);
        sentryBreadCrumb(`finished copying ${sourcePath} to  ${destPath}`);
        resolve(destPath);
      }
    });
  });
}

export function getExtension(path: string) {
  return Path.extname(path).toLowerCase().replace(/\./g, "");
}
