// this engages a babel macro that does cool emotion stuff (like source maps). See https://emotion.sh/docs/babel-macros
import css from "@emotion/css/macro";
// these two lines make the css prop work on react elements
import { jsx } from "@emotion/core";
/** @jsx jsx */
import * as React from "react";
import ReactModal from "react-modal";
import CloseOnEscape from "react-close-on-escape";
import { Trans } from "@lingui/react";
import { t } from "@lingui/macro";
import * as _ from "lodash";

const ReactMarkdown = require("react-markdown");
import Semver from "semver";
import { sentryException } from "../other/errorHandling";
import { i18n } from "@lingui/core";
import { people_background_color, saymore_orange } from "./colors";
import axios from "axios";
import { NotifyNoBigDeal, NotifyUpdateAvailable } from "./Notify";
type Mode =
  | "querying"
  | "update-available"
  | "just-show-release-notes"
  | "closed";

type Channel = "alpha" | "beta" | "release";

interface IGithubRelease {
  assets: { browser_download_url: string }[];
  body: string;
  created_at: string;
  draft: boolean;
  html_url: string;
  name: string;
  prerelease: boolean;
  published_at: string;
  tag_name: string;
}

let checkForUpdates: () => void = () => {};
let showDialogManually: () => void;
export { showDialogManually as ShowReleasesDialog };

export const ReleasesDialog: React.FunctionComponent<{}> = (props) => {
  const [mode, setMode] = React.useState<Mode>("querying");
  const [allReleases, setAllReleases] = React.useState<IGithubRelease[]>([]);
  const [showNewReleasesOnly, setShowNewReleasesOnly] = React.useState(true);
  const [version, setVersion] = React.useState("");
  React.useEffect(() => {
    const pkg = require("../package.json");
    setVersion(pkg.version);
  }, []);
  console.log("Version = " + version);
  const channelsToRecommend = getChannelsToRecommend();
  //checkForUpdates = (callback: (haveUpdates: boolean) => void) => {
  checkForUpdates = () => {
    axios
      .get("https://api.github.com/repos/onset/lameta/releases")
      .then((result) => {
        const all = sortReleases(result.data).filter((r) => r.draft === false);

        // const all = [
        //   {
        //     assets: [],
        //     body: "foo",
        //     created_at: "",
        //     draft: false,
        //     html_url: "",
        //     name: "foo",
        //     prerelease: false,
        //     published_at: "",
        //     tag_name: "0.8.0-beta.1",
        //   },
        // ];
        setAllReleases(all);
        if (getNewerReleases(all, channelsToRecommend).length) {
          NotifyUpdateAvailable(() => setMode("update-available"));
        }
      })
      .catch((error) => {
        NotifyNoBigDeal("Could not check for updates");
        console.error(`There was an error checking for updates.`);
        sentryException(error);
      });
  };

  React.useEffect(() => {
    showDialogManually = () => {
      setShowNewReleasesOnly(false);
      setMode("just-show-release-notes");
    };
  });

  // run once on startup
  React.useEffect(() => checkForUpdates(), []);

  const releasesToShow = showNewReleasesOnly
    ? getNewerReleases(allReleases, channelsToRecommend)
    : allReleases;

  //const notes = notesArray ? notesArray!.map((n) => n.note).join("<br/>") : "";
  return (
    <CloseOnEscape onEscape={() => setMode("closed")}>
      <ReactModal
        ariaHideApp={false}
        className="releaseDialog" // this cannot be empty, even if you don't use it, else the dialog is shoved to the upper left
        isOpen={
          mode === "just-show-release-notes" || mode === "update-available"
        }
        shouldCloseOnOverlayClick={true}
        onRequestClose={() => setMode("closed")}
      >
        <div className={"dialogTitle "}>
          <div>
            <Trans>Release Notes</Trans>
          </div>
          <div
            css={css`
              float: right;
              font-size: 16px;
              color: ${saymore_orange};
              margin-bottom: auto;
              margin-top: auto;
            `}
          >
            {/* I couldn't get version to show up inside this string in a packaged lameta, just dev. That's why it is now outside. */}
            {i18n._(t`You are running lameta version: `)}&nbsp;{version}
          </div>
        </div>
        <div
          className="dialogContent"
          css={css`
            width: 700px;
            height: 600px;
            max-height: 600px;
            display: block !important;
          `}
        >
          <div
            css={css`
              min-height: 100px;
              overflow: hidden;
            `}
          >
            {!allReleases ||
              (allReleases.length === 0 && (
                <p>
                  Sorry, lameta could not retrieve the release notes from
                  github.
                </p>
              ))}
            {releasesToShow.map((release, index) => (
              <div
                key={release.name}
                css={css`
                  &:not(:first-child) {
                  margin-top: sem !important;
                  
                `}
              >
                <h1
                  css={css`
                    margin-bottom: 10px !important;
                    background-color: ${people_background_color};
                    padding: 5px;
                    padding-bottom: 35px;
                    font-size: 14pt !important;
                    padding-left: 10px;
                  `}
                >
                  {release.name}
                  {/* If we're showing the dialog prompting them to upgrade, only give the top option of their current channel for Downloading */}
                  {(index === 0 || mode === "just-show-release-notes") &&
                    getDownloadUrl(release) && (
                      <a
                        css={css`
                          float: right;
                        `}
                        href={getDownloadUrl(release)}
                      >
                        <Trans>Download</Trans>
                      </a>
                    )}
                </h1>

                <ReactMarkdown
                  // note: the gfm plugin actually did worse that standard... it turned 2nd level bullets into <pre>
                  css={css`
                    * {
                      max-width: 100%;
                    }
                  `}
                  children={release.body}
                />
              </div>
            ))}
          </div>
        </div>
        <div
          css={css`
            width: 100%;
            padding-left: 40px;
          `}
          className={"bottomButtonRow"}
        >
          {mode === "update-available" && (
            <label
              css={css`
                margin-right: auto;
              `}
            >
              <input
                type="checkbox"
                checked={!showNewReleasesOnly}
                onChange={(event) => {
                  setShowNewReleasesOnly(!event.target.checked);
                }}
              ></input>
              {i18n._(t`Show more releases`)}
            </label>
          )}
          <div
            className={"okCancelGroup"}
            css={css`
              margin-left: auto;
            `}
          >
            <button onClick={() => setMode("closed")}>
              <Trans>Close</Trans>
            </button>
          </div>
        </div>
      </ReactModal>
    </CloseOnEscape>
  );
};

function getDownloadUrl(release: any) {
  try {
    const platformToExtension = { win32: "exe", darwin: "dmg" };
    const installerExtension = platformToExtension[process.platform];
    const url = (release.assets as Array<any>).find((a) =>
      _.endsWith(a.browser_download_url, installerExtension)
    );
    return url?.browser_download_url;
  } catch (error) {
    sentryException(error);
    return undefined;
  }
}

function getChannel(version: string): Channel {
  if (_.includes(version, "alpha")) return "alpha";
  if (_.includes(version, "beta")) return "beta";
  return "release";
}

// this isn't ideal... once someone goes up to a release, they'll never be
// informed about betas. To improve this, we will need some more UI so that
// people can specify what channels they are interested in hearing about.
function getChannelsToRecommend(): Channel[] {
  const current = getChannel(require("../package.json").version as string);
  if (current === "alpha") return ["alpha", "beta", "release"];
  if (current === "beta") return ["beta", "release"];
  return ["release"];
}

function getNewerReleases(
  releasesNewestFirst: IGithubRelease[],
  channelsToInclude: Channel[]
) {
  const current = require("../package.json").version as string;
  return releasesNewestFirst.filter(
    (r) =>
      channelsToInclude.includes(getChannel(r.tag_name)) &&
      Semver.compare(r.tag_name, current) > 0
  );
}

function sortReleases(releases: IGithubRelease[]) {
  try {
    // Here we call "coerce" to make it a bit more tolerant of accidents like an upper-case V or a missing 3rd digit.
    // But if we really screw up, an get an error here,  just give up on the sorting.
    releases.sort(
      (a, b) =>
        Semver.compare(
          Semver.coerce(a.tag_name) || a.tag_name,
          Semver.coerce(b.tag_name) || b.tag_name
        ) * -1
    );
  } catch (err) {
    console.error("Error while trying to sort releases.");
    console.error(err);
    sentryException(err);
  }
  return releases;
}
