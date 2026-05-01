export const site = {
    company_name: 'Wan Da Nya Inc.',
    service_name: 'Animal Mobility Platform',
    brand_name: 'Wan Da Nya',
    copyright_year: 2026,
  } as const
  
  export function get_current_year() {
    return new Date().getFullYear()
  }
  
  export function get_copyright_text() {
    return `© ${get_current_year()} ${site.company_name}`
  }