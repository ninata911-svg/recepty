const ADMIN_KEY_STORAGE = "receptyAdminKey";

const editorActions =
  document.querySelector("#editor-actions");

const editorLogout =
  document.querySelector("#editor-logout");

const editorKey =
  sessionStorage.getItem(ADMIN_KEY_STORAGE);

if (editorActions && editorKey) {
  editorActions.hidden = false;
}

editorLogout?.addEventListener(
  "click",
  () => {
    sessionStorage.removeItem(
      ADMIN_KEY_STORAGE
    );

    editorActions.hidden = true;
  }
);
