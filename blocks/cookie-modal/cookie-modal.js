export default function decorate(block) {
  const rows = [...block.children];

  // Cookie Modal main fields (row 0)
  console.log('modalText:', rows[0]?.innerHTML?.trim());

  // Cookie Policy Button fields (row 1)
  console.log('cookiePolicyLink:', rows[1]?.querySelector('a')?.href);
  console.log('cookiePolicyLinkText:', rows[1]?.textContent?.trim());
  console.log('cookiePolicyLinkTitle:', rows[1]?.querySelector('a')?.title);
  console.log('cookiePolicyLinkType:', rows[1]?.querySelector('a')?.className);

  // Cookie Settings Button fields (row 2)
  console.log('cookieSettingsLink:', rows[2]?.querySelector('a')?.href);
  console.log('cookieSettingsLinkText:', rows[2]?.textContent?.trim());
  console.log('cookieSettingsLinkTitle:', rows[2]?.querySelector('a')?.title);
  console.log('cookieSettingsLinkType:', rows[2]?.querySelector('a')?.className);

  // Accept All Button fields (row 3)
  console.log('acceptAllLink:', rows[3]?.querySelector('a')?.href);
  console.log('acceptAllLinkText:', rows[3]?.textContent?.trim());
  console.log('acceptAllLinkTitle:', rows[3]?.querySelector('a')?.title);
  console.log('acceptAllLinkType:', rows[3]?.querySelector('a')?.className);

  // Cookie Modal Field items (rows 4+)
  rows.slice(4).forEach((item, index) => {
    const itemRows = [...item.children];
    console.log(`cookieField[${index}] title:`, itemRows[0]?.textContent?.trim());
    console.log(`cookieField[${index}] description:`, itemRows[1]?.innerHTML?.trim());
    console.log(`cookieField[${index}] linkUrl:`, itemRows[2]?.querySelector('a')?.href || itemRows[2]?.textContent?.trim());
    console.log(`cookieField[${index}] linkText:`, itemRows[3]?.textContent?.trim() || itemRows[2]?.querySelector('a')?.textContent?.trim());
  });
}
