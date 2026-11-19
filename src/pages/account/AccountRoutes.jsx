// Full-screen routes outside the main app shell: sign-in, consent and the
// legal pages.

import { Navigate, Route, Routes } from 'react-router-dom'
import { accountsAvailable } from '../../lib/supabase.js'
import BringData from './BringData.jsx'
import Consent from './Consent.jsx'
import { PrivacyPolicy, Terms } from './Legal.jsx'
import { ConfirmEmail, CreateAccount, EmailStep, NewPassword, PasswordStep, ResetPassword, Welcome } from './SignIn.jsx'

const ACCOUNT_PATH = /^\/(welcome|account(\/.*)?|privacy|terms)$/
export const isAccountRoute = (pathname) => ACCOUNT_PATH.test(pathname)
// Screens a signed-in person has no reason to be on.
export const isSignInRoute = (pathname) =>
  /^\/(welcome|account\/(email|password|create|confirm|reset))$/.test(pathname)

export default function AccountRoutes() {
  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<Terms />} />
      {accountsAvailable && (
        <>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/account/email" element={<EmailStep />} />
          <Route path="/account/password" element={<PasswordStep />} />
          <Route path="/account/create" element={<CreateAccount />} />
          <Route path="/account/confirm" element={<ConfirmEmail />} />
          <Route path="/account/reset" element={<ResetPassword />} />
          <Route path="/account/new-password" element={<NewPassword />} />
          <Route path="/account/consent" element={<Consent />} />
          <Route path="/account/bring-data" element={<BringData />} />
        </>
      )}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
