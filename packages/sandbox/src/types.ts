/**
 * A sandbox account used for reproduction (issue 60). Credentials are held as
 * references to secrets, never inline — the runner resolves them at use time.
 */
export interface SandboxAccount {
  id: string
  role: string
  usernameSecret: string
  passwordSecret: string
}
