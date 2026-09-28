export const ADMIN_USER_EDIT_INTENT = {
  save: "save_user",
  deactivate: "deactivate_user",
  activate: "activate_user",
  resetPassword: "reset_user_password",
};

/** @param {string} intent */
export function getAdminUserEditOperation(intent) {
  switch (intent) {
    case ADMIN_USER_EDIT_INTENT.save:
      return "save";
    case ADMIN_USER_EDIT_INTENT.deactivate:
      return "deactivate";
    case ADMIN_USER_EDIT_INTENT.activate:
      return "activate";
    case ADMIN_USER_EDIT_INTENT.resetPassword:
      return "reset-password";
    default:
      return null;
  }
}
