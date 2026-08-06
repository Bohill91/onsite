(function initialiseOnSiteLaunch() {
  const root = document.documentElement;
  const launchScreen = document.getElementById("app-launch-screen");
  const authOverlay = document.getElementById("auth-overlay");
  const progress = launchScreen?.querySelector("[data-launch-progress]");
  const errorState = launchScreen?.querySelector("[data-launch-error]");
  const retryButton = launchScreen?.querySelector("[data-launch-retry]");
  let launchState = "loading";
  let cleanupTimer = 0;

  function removeLaunchScreen() {
    window.clearTimeout(cleanupTimer);
    if (!launchScreen) return;
    launchScreen.hidden = true;
    launchScreen.classList.remove("is-exiting");
  }

  function ready() {
    if (launchState !== "loading") return;
    launchState = "ready";
    authOverlay?.removeAttribute("inert");
    root.classList.remove("app-booting");
    root.classList.add("app-ready");

    if (!launchScreen) return;
    launchScreen.setAttribute("aria-hidden", "true");
    launchScreen.classList.add("is-exiting");
    launchScreen.addEventListener("transitionend", removeLaunchScreen, {
      once: true,
    });
    cleanupTimer = window.setTimeout(removeLaunchScreen, 260);
  }

  function fail(error) {
    if (launchState !== "loading") return;
    launchState = "failed";
    console.error("OnSite startup failed", error);
    root.classList.add("app-booting");

    if (!launchScreen) return;
    launchScreen.hidden = false;
    launchScreen.classList.remove("is-exiting");
    launchScreen.classList.add("is-error");
    launchScreen.setAttribute("role", "alert");
    launchScreen.setAttribute("aria-live", "assertive");
    launchScreen.removeAttribute("aria-hidden");
    progress?.setAttribute("aria-hidden", "true");
    errorState?.setAttribute("aria-hidden", "false");
    retryButton?.focus();
  }

  retryButton?.addEventListener("click", () => window.location.reload());

  window.addEventListener(
    "error",
    (event) => {
      if (launchState !== "loading") return;
      const scriptSource =
        event.target instanceof HTMLScriptElement ? event.target.src || "" : "";
      const essentialScriptFailed =
        /(?:^|\/)(?:ui|app|auth)\.js(?:[?#]|$)/.test(scriptSource);
      if (!event.error && !essentialScriptFailed) return;
      fail(
        event.error ||
          new Error(`Unable to load ${scriptSource || "an application script"}`),
      );
    },
    true,
  );

  window.addEventListener("unhandledrejection", (event) => {
    if (launchState !== "loading") return;
    fail(event.reason || new Error("An application startup task failed"));
  });

  window.OnSiteLaunch = Object.freeze({ ready, fail });
})();
