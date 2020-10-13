import { Session } from "../model/Project/Session/Session";
import { Project } from "../model/Project/Project";
import { Folder } from "../model/Folder/Folder";
import { File } from "../model/file/File";
import * as Path from "path";
import * as fs from "fs-extra";
import ImdiGenerator from "./ImdiGenerator";
import { log } from "util";
import { sentryBreadCrumb } from "../errorHandling";
import { sanitizeForArchive } from "../sanitizeForArchive";
import * as temp from "temp";
import { CustomFieldRegistry } from "../model/Project/CustomFieldRegistry";
import * as glob from "glob";
temp.track();

// This class handles making/copying all the files for an IMDI archive.
export default class ImdiBundler {
  public static saveImdiBundleToFolder(
    project: Project,
    rootDirectory: string,
    // If this is false, we're just making the IMDI files.
    // If true, then we're also copying in most of the project files (but not some Saymore-specific ones).
    copyInProjectFiles: boolean,
    folderFilter: (f: Folder) => boolean,
    omitNamespaces?: boolean
  ) {
    //throw new Error("oof");

    sentryBreadCrumb("Starting saveImdiBundleToFolder");
    try {
      if (fs.existsSync(rootDirectory)) {
        fs.removeSync(rootDirectory);
      }
      // make all parts of the directory as needed
      fs.ensureDirSync(rootDirectory);
    } catch (error) {
      console.log(error);
      alert(
        `There was a problem getting the directory ${rootDirectory} ready. Maybe close any open Finder/Explorer windows or other programs that might be showing file from that directory,  and try again. \r\n\r\n${error}`
      );
      return;
    }
    /* we want (from saymore classic)
     myproject_3-6-2019/  <--- rootDirectory
        myproject.imdi
        myproject/     <--- "secondLevel"
          session1.imdi
          session2.imdi
          session1/
             ...files...
          session2/
             ...files...
    */

    const childrenSubpaths: string[] = new Array<string>();
    const secondLevel = Path.basename(project.directory);
    try {
      fs.ensureDirSync(Path.join(rootDirectory, secondLevel));
    } catch (error) {
      alert(
        `There was a problem getting the directory ${Path.join(
          rootDirectory,
          secondLevel
        )} ready. Maybe close any open Finder/Explorer windows and try again`
      );
      return;
    }
    //---- Project Documents -----

    this.outputDocumentFolder(
      project,
      "OtherDocuments",
      "OtherDocuments.imdi",
      rootDirectory,
      secondLevel,
      project.otherDocsFolder,
      childrenSubpaths,
      copyInProjectFiles
    );

    this.outputDocumentFolder(
      project,
      "DescriptionDocuments",
      "DescriptionDocuments.imdi",
      rootDirectory,
      secondLevel,
      project.descriptionFolder,
      childrenSubpaths,
      copyInProjectFiles
    );

    // I'm thinking, this only makes sense if we're going to provide the files
    if (copyInProjectFiles) {
      this.addConsentBundle(
        project,
        rootDirectory,
        secondLevel,
        childrenSubpaths,
        copyInProjectFiles,
        folderFilter,
        omitNamespaces
      );
    }

    //---- Sessions ----

    project.sessions.filter(folderFilter).forEach((session: Session) => {
      const imdi = ImdiGenerator.generateSession(session, project);
      const imdiFileName = `${session.filePrefix}.imdi`;
      fs.writeFileSync(
        Path.join(
          rootDirectory,
          secondLevel,
          sanitizeForArchive(imdiFileName, true)
        ),
        imdi
      );
      childrenSubpaths.push(secondLevel + "/" + imdiFileName);

      if (copyInProjectFiles) {
        this.copyFolderOfFiles(
          session.files,
          Path.join(
            rootDirectory,
            secondLevel,
            Path.basename(session.directory)
          )
        );
      }
    });

    //childrenSubpaths.push(..something for consent if we have it---);

    // ---  Now that we know what all the child imdi's are, we can output the root  ---
    fs.writeFileSync(
      Path.join(rootDirectory, `${project.displayName}.imdi`),
      ImdiGenerator.generateCorpus(project, childrenSubpaths, false)
    );

    sentryBreadCrumb("Done with saveImdiBundleToFolder");
  }

  private static copyFolderOfFiles(files: File[], targetDirectory: string) {
    fs.ensureDirSync(Path.join(targetDirectory));
    let errors = "";
    let count = 0;
    let failed = 0;
    files.forEach((f: File) => {
      if (ImdiGenerator.shouldIncludeFile(f.describedFilePath)) {
        count++;
        try {
          fs.copyFileSync(
            f.describedFilePath,
            Path.join(
              targetDirectory,
              sanitizeForArchive(Path.basename(f.describedFilePath), true)
            )
          );
        } catch (error) {
          errors = errors + `Problem copying ${f.describedFilePath}+\r\n`;
          log(error);
          failed++;
        }
      }
    });

    if (errors.length > 0) {
      alert(`Failed to copy ${failed} of ${count} files\r\n${errors}`);
    }
  }

  // IMDI doesn't have a place for project-level documents, so we have to create this
  // dummy Session to contain them.
  private static outputDocumentFolder(
    project: Project,
    name: string,
    imdiFileName: string,
    rootDirectory: string,
    secondLevel: string,
    folder: Folder,
    subpaths: string[],
    copyInProjectFiles: boolean
  ): void {
    if (folder.files.length > 0) {
      const generator = new ImdiGenerator(folder, project);
      const projectDocumentsImdi = generator.makePseudoSessionImdiForOtherFolder(
        name,
        folder
      );

      ImdiBundler.WritePseudoSession(
        rootDirectory,
        secondLevel,
        imdiFileName,
        projectDocumentsImdi,
        subpaths,
        copyInProjectFiles,
        folder
      );
    }
  }

  // This is called 3 times, to create folders and imdi files: one for project description documents,
  // other project documents, and a collection of all the consent files we find
  private static WritePseudoSession(
    rootDirectory: string,
    secondLevel: string,
    imdiFileName: string,
    imdiXml: string,
    subpaths: string[],
    copyInProjectFiles: boolean,
    folder: Folder
  ) {
    fs.writeFileSync(
      Path.join(
        rootDirectory,
        secondLevel,
        sanitizeForArchive(imdiFileName, true)
      ),
      imdiXml
    );
    subpaths.push(secondLevel + "/" + imdiFileName);

    const destinationFolderPath = Path.join(
      rootDirectory,
      secondLevel,
      Path.basename(imdiFileName, ".imdi" /* tells basename to strip this off*/)
    );

    if (copyInProjectFiles) {
      this.copyFolderOfFiles(folder.files, destinationFolderPath);
    }
  }

  // IMDI doesn't have a place for consent files, so we have to create this
  // dummy Session to contain them.
  private static addConsentBundle(
    project: Project,
    rootDirectory: string,
    secondLevel: string,
    subpaths: string[],
    // If this is false, we're just making the IMDI files.
    // If true, then we're also copying in most of the project files (but not some Saymore-specific ones).
    copyInProjectFiles: boolean,
    folderFilter: (f: Folder) => boolean,
    omitNamespaces?: boolean
  ) {
    const dir = temp.mkdirSync("imdiConsentBundle");

    // complex: for each session, find each involved person, copy in their consent.
    // simpler: for each person, for each document, if it is marked as consent, copy it in
    // for now, we're simply finding all files with the right pattern and copying them in, where ever they are.
    const filePaths = glob.sync(Path.join(project.directory, "**/*_Consent.*"));

    filePaths.forEach((path) => {
      fs.copyFileSync(path, Path.join(dir, Path.basename(path)));
    });

    const dummySession = Session.fromDirectory(dir, new CustomFieldRegistry());
    dummySession.properties.setText(
      "id",
      project.displayName + " consent documents"
    );
    dummySession.properties.setText(
      "title",
      `Documentation of consent for the contributors to the ${project.properties.getTextStringOrEmpty(
        "title"
      )}`
    );
    dummySession.properties.setText(
      "description",
      `This bundle contains media demonstrating informed consent for sessions in this bundle.`
    );
    dummySession.properties.setText("genre", "Secondary document");
    dummySession.properties.setText("subgenre", "Consent forms");
    //dummySession.files.forEach(consentFile=>consentFile.setTextProperty("",""))

    const imdiXml = ImdiGenerator.generateSession(
      dummySession,
      project,
      omitNamespaces
    );
    const imdiFileName = `${dummySession.filePrefix}.imdi`;

    ImdiBundler.WritePseudoSession(
      rootDirectory,
      secondLevel,
      "ConsentDocuments.imdi",
      imdiXml,
      subpaths,
      copyInProjectFiles,
      dummySession
    );
  }
}
