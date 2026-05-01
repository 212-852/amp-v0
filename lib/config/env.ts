// routing environment variables
export const env = {
    app_url: process.env.NEXT_PUBLIC_APP_URL ?? '',
  
    domain: {
      platform: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? '',
      corporate: process.env.NEXT_PUBLIC_CORPORATE_DOMAIN ?? '',
      airport: process.env.NEXT_PUBLIC_AIRPORT_DOMAIN ?? '',
    },
  } as const