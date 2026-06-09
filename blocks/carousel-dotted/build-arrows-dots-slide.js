import { moveInstrumentation } from '../../scripts/scripts.js';

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

    // onlyImage (cell 13), onlyImageAlt (cell 14)
    const onlyImageCell = cells[15];

    const picture = onlyImageCell?.querySelector('picture');
    if (picture) {
      slide.append(picture);
    }

    return slide;
  }

  if (slideType === 'withCircularImage') {
    slide.className = 'carousel-dotted-item with-circular-image item';

    // circularImage (cell 10), title (cell 11), description (cell 12, link (cell 13)
    const circularImageCell = cells[10];
    const titleCell = cells[11];
    const descriptionCell = cells[12];
    const linkCell = cells[13];

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
      const buttonContainer = linkCell.querySelector('.button-container');
      if (buttonContainer) {
        content.append(buttonContainer);
      } else {
        const a = linkCell.querySelector('a');
        if (a) content.append(a);
      }
    }

    slide.append(content);
    return slide;
  }

  if (slideType === 'withDefaultImage') {
    slide.className = 'carousel-dotted-item with-default-image item has-caption bgd-white';

    // defaultImage (cell 2), title+description RTE (cell 3), stepText1 (cell 4),
    // description1 (cell 5), stepText2 (cell 6), description2 (cell 7), ctaLink (cell 8)
    const defaultImageCell = cells[2];
    const titleCell = cells[3];
    const stepText1Cell = cells[4];
    const description1Cell = cells[5];
    const stepText2Cell = cells[6];
    const description2Cell = cells[7];
    const ctaLinkCell = cells[8];

    // image
    const imageContainer = document.createElement('div');
    imageContainer.className = 'img-thumb';
    const picture = defaultImageCell?.querySelector('picture');
    if (picture) imageContainer.append(picture);
    slide.append(imageContainer);

    // content container
    const content = document.createElement('div');
    content.className = 'caption editor';

    // Title field: first heading becomes the title (h3.title-3);
    // any remaining content in the same field is rendered as description below the title.
    if (titleCell && titleCell.textContent.trim()) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = titleCell.innerHTML;

      const heading = tempDiv.querySelector('h1, h2, h3, h4, h5, h6');
      if (heading) {
        const titleEl = document.createElement('h3');
        titleEl.className = 'title-3';
        titleEl.innerHTML = heading.innerHTML;
        content.append(titleEl);
        heading.remove();
      } else {
        const titleEl = document.createElement('h3');
        titleEl.className = 'title-3';
        titleEl.innerHTML = tempDiv.innerHTML;
        content.append(titleEl);
        tempDiv.innerHTML = '';
      }

      // Render any non-heading content from the title field as inline description
      if (tempDiv.textContent.trim()) {
        const descWrap = document.createElement('div');
        descWrap.className = 'text-default editor pad-bot';
        while (tempDiv.firstChild) descWrap.append(tempDiv.firstChild);
        content.append(descWrap);
      }
    }

    // Step 1 + Description 1 (separate fields — rendered independently)
    const hasStep1 = stepText1Cell && stepText1Cell.textContent.trim();
    const hasDesc1 = description1Cell && description1Cell.textContent.trim();
    if (hasStep1 || hasDesc1) {
      const wrap = document.createElement('div');
      wrap.className = 'text-default editor pad-bot';
      if (hasStep1) {
        const stepP = document.createElement('p');
        stepP.className = 'text-large text-light';
        stepP.textContent = stepText1Cell.textContent.trim();
        wrap.append(stepP);
      }
      if (hasDesc1) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = description1Cell.innerHTML;
        while (tempDiv.firstChild) wrap.append(tempDiv.firstChild);
      }
      content.append(wrap);
    }

    // Step 2 + Description 2
    const hasStep2 = stepText2Cell && stepText2Cell.textContent.trim();
    const hasDesc2 = description2Cell && description2Cell.textContent.trim();
    if (hasStep2 || hasDesc2) {
      const wrap = document.createElement('div');
      wrap.className = 'text-default editor pad-bot';
      if (hasStep2) {
        const stepP = document.createElement('p');
        stepP.className = 'text-large text-light';
        stepP.textContent = stepText2Cell.textContent.trim();
        wrap.append(stepP);
      }
      if (hasDesc2) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = description2Cell.innerHTML;
        while (tempDiv.firstChild) wrap.append(tempDiv.firstChild);
      }
      content.append(wrap);
    }

    if (ctaLinkCell && ctaLinkCell.textContent.trim()) {
      const buttonContainer = ctaLinkCell.querySelector('.button-container');
      if (buttonContainer) {
        content.append(buttonContainer);
      } else {
        const a = ctaLinkCell.querySelector('a');
        if (a) content.append(a);
      }
    }

    slide.append(content);
    return slide;
  }

  slide.className = 'carousel-dotted-item';
  return slide;
}
