const locale = (language: string): string => (language === 'ru' ? 'ru-RU' : 'en-US');

/** Map label style: "8.5M ₫" (en) / "8,5 млн ₫" (ru). */
export function formatPriceCompact(vnd: number, language: string): string {
  const value = new Intl.NumberFormat(locale(language), {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(vnd);
  return `${value} ₫`;
}

/** "12,000,000 ₫" / "12 000 000 ₫" */
export function formatPriceFull(vnd: number, language: string): string {
  return `${new Intl.NumberFormat(locale(language), { maximumFractionDigits: 0 }).format(vnd)} ₫`;
}

export function formatArea(area: string | number, language: string): string {
  const value = new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1 }).format(
    Number(area),
  );
  return `${value} m²`;
}

export function formatDate(iso: string, language: string): string {
  return new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium' }).format(new Date(iso));
}

export function districtName(
  district: { name_en: string; name_ru: string },
  language: string,
): string {
  return language === 'ru' ? district.name_ru : district.name_en;
}
