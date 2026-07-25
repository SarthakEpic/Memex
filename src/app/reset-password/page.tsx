import { PasswordResetForm } from "@/components/auth/password-reset-forms"

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const params = await searchParams
  return <PasswordResetForm token={params.token || ""} />
}
