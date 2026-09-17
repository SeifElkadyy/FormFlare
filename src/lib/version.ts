import pkg from "../../package.json";

/** Installed version of this copy. Bumped only in a tagged release commit. */
export const APP_VERSION: string = pkg.version;

/** Upstream GitHub repo the in-app updater polls. */
export const UPSTREAM_REPO = "SeifElkadyy/FormFlare";
