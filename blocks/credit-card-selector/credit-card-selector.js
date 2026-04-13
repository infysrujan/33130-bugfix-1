export default function decorate(block) {
  const rows = [...block.children];
  rows.forEach((row, i) => {
    console.log(i, row.innerHTML);
  });
}
