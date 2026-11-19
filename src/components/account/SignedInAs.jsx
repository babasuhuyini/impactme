import { signOut, useAccount } from '../../data/account.js'

// "Signed in as …" with a way out, on the screens before anything syncs, so
// nobody adds their data to an account that isn't theirs (for example after
// opening someone else's link).
export default function SignedInAs() {
  const { user } = useAccount()
  if (!user) return null
  return (
    <p className="signed-in-as">
      Signed in as <strong>{user.email}</strong>.{' '}
      <button type="button" className="auth-link inline" onClick={() => signOut()}>
        Not you? Sign out
      </button>
    </p>
  )
}
