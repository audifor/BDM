import { deriveCountryFlagColors } from '@/ui-ng/applications/player/data/presentationHelpers'

export function CountryNationalityMark({ code }: { readonly code: string }) {
  const colors = deriveCountryFlagColors(code)

  return (
    <span className="po-identity__nationality">
      <span aria-hidden className="po-identity__flag">
        <span className="po-identity__flag-stripe" style={{ background: colors.primary }} />
        <span className="po-identity__flag-stripe" style={{ background: colors.secondary }} />
      </span>
      <span className="po-identity__nationality-code">{code}</span>
    </span>
  )
}
