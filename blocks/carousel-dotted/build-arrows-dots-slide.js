import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Build a slide for showArrowsDots variant.
 * Cell layout (carousel-dotted-slide-arrows):
 *  cells[0] = variant (hidden), cells[1] = slideType (select)
 * slideType values:
 *   withDefaultImage: 0:variant, 1:slideType, 2:defaultImage, 3:titleDefaultImage,
 *                     4:step, 5:descriptionDefaultImage  (no link group → no merging)
 *   withCircularImage: 0:variant, 1:slideType,
 *                      2-5: withDefaultImage fields (reserved, empty),
 *                      6:circularImage, 7:titleCircularImage, 8:descriptionCircularImage,
 *                      9:link (merged — AEM UE merges link+linkText+linkTitle+linkType into 1 cell)
 */
export default function buildSlideArrowsandDots(row, index) {
  const cells = [...row.children];
  const slide = document.createElement('div');
  slide.dataset.index = index;
  moveInstrumentation(row, slide);

  // cells[1] is now a select with the slide type value
  const slideType = cells[1]?.textContent.trim();

  // Build a slide for the simpleCarousel / onlyImage variation.
  if (slideType === 'simpleCarousel' || slideType === 'onlyImage') {
    slide.className = 'carousel-dotted-item simple-carousel item';

    // onlyImage (cell 10), onlyImageAlt (cell 11)
    const onlyImageCell = cells[10];

    const picture = onlyImageCell?.querySelector('picture');
    if (picture) {
      slide.append(picture);
    }

    return slide;
  }

  if (slideType === 'withCircularImage') {
    slide.className = 'carousel-dotted-item with-circular-image item';

    // circularImage (cell 6), title (cell 7), description (cell 8), link (cell 9)
    const circularImageCell = cells[6];
    const titleCell = cells[7];
    const descriptionCell = cells[8];
    const linkCell = cells[9];

    // image
    const imageContainer = document.createElement('div');
    imageContainer.className = 'circle-image';
    const picture = circularImageCell?.querySelector('picture');
    if (picture) imageContainer.append(picture);
    slide.append(imageContainer);

    // content container
    const content = document.createElement('div');
    content.className = 'caption';

    if (titleCell && titleCell.textContent.trim()) {
      const title = document.createElement('h3');
      title.className = 'title-2';
      title.innerHTML = titleCell.innerHTML;
      content.append(title);
    }

    if (descriptionCell && descriptionCell.textContent.trim()) {
      const description = document.createElement('div');
      description.className = 'name text-brown text-default';
      while (descriptionCell.firstChild) description.append(descriptionCell.firstChild);
      content.append(description);
    }

    if (linkCell && linkCell.textContent.trim()) {
      const linkWrap = document.createElement('div');
      linkWrap.className = 'button-group';
      const a = linkCell.querySelector('a');
      if (a) {
        a.className = 'sub-title-medium link-primary';
        linkWrap.append(a);
      } else {
        while (linkCell.firstChild) linkWrap.append(linkCell.firstChild);
      }
      content.append(linkWrap);
    }

    slide.append(content);
    return slide;
  }

  if (slideType === 'withDefaultImage') {
    slide.className = 'carousel-dotted-item with-default-image item has-caption bgd-white';

    // defaultImage (cell 2), title (cell 3), step (cell 4), description (cell 5)
    const defaultImageCell = cells[2];
    const titleCell = cells[3];
    const stepCell = cells[4];
    const descriptionCell = cells[5];

    // image
    const imageContainer = document.createElement('div');
    imageContainer.className = 'img-thumb';
    const picture = defaultImageCell?.querySelector('picture');
    if (picture) imageContainer.append(picture);
    slide.append(imageContainer);

    // content container
    const content = document.createElement('div');
    content.className = 'caption editor';

    if (titleCell && titleCell.textContent.trim()) {
      const title = document.createElement('h3');
      title.className = 'title-3';
      title.innerHTML = titleCell.innerHTML;
      content.append(title);
    }

    const hasTitle = titleCell && titleCell.textContent.trim();
    const hasStep = stepCell && stepCell.textContent.trim();
    const hasDesc = descriptionCell && descriptionCell.textContent.trim();

    if (hasTitle || hasStep || hasDesc) {
      const textWrap = document.createElement('div');
      textWrap.className = 'text-default editor pad-bot';

      if (hasStep) {
        const step = document.createElement('p');
        step.className = 'text-large text-light';
        step.innerHTML = stepCell.innerHTML;
        textWrap.append(step);
      }

      if (hasDesc) {
        while (descriptionCell.firstChild) textWrap.append(descriptionCell.firstChild);
      }
      content.append(textWrap);
    }

    slide.append(content);
    return slide;
  }

  slide.className = 'carousel-dotted-item';
  return slide;
}
