export default function decorate(block) {
  const rows = [...block.children];

  // Alert Banner fields (rows 0–4)
  console.log('alertDescription:', rows[0]?.innerHTML?.trim());
  console.log('privacyPolicyLink:', rows[1]?.querySelector('a')?.href);
  console.log('privacyPolicyLinkText:', rows[2]?.textContent?.trim());
  console.log('alertAcceptLabel:', rows[3]?.textContent?.trim());
  console.log('alertManageLabel:', rows[4]?.textContent?.trim());

  // Cookie Modal fields (rows 5–7)
  console.log('modalTitle:', rows[5]?.textContent?.trim());
  console.log('modalDescription:', rows[6]?.innerHTML?.trim());
  console.log('modalSaveLabel:', rows[7]?.textContent?.trim());

  // Accordion items (rows 8+)
  rows.slice(8).forEach((item, index) => {
    const itemRows = [...item.children];
    console.log(`accordionItem[${index}] title:`, itemRows[0]?.textContent?.trim());
    console.log(`accordionItem[${index}] details:`, itemRows[1]?.innerHTML?.trim());
  });
}
