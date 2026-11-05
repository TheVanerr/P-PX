/* A4 sayfa oluşturma — antet + içerik + alt bilgi + sayfa numarası */

const LETTERHEAD_CONTENT_MAX_HEIGHT = 918;

function buildLetterheadPage({ firma, modelName, pageNumber, content }) {
  const brand = (typeof HEADER_BRANDS !== 'undefined' && HEADER_BRANDS[firma])
    ? HEADER_BRANDS[firma]
    : { color: '#ff0000' };

  const page = document.createElement('div');
  page.className = 'a4-page';
  if (pageNumber != null) page.id = 'a4-page-' + pageNumber;
  page.style.setProperty('--brand-color', brand.color);

  if (firma && typeof buildHeader === 'function') {
    page.appendChild(buildHeader(firma, modelName));
  }

  const footerLine = document.createElement('div');
  footerLine.className = 'ph-footer-line';
  page.appendChild(footerLine);

  const pageContent = document.createElement('div');
  pageContent.className = 'page-content';

  if (content) {
    const nodes = Array.isArray(content) ? content : [content];
    for (const node of nodes) {
      if (node instanceof Node) pageContent.appendChild(node);
    }
  }

  page.appendChild(pageContent);

  if (pageNumber != null) {
    const num = document.createElement('div');
    num.className = 'page-number';
    num.textContent = pageNumber;
    page.appendChild(num);
  }

  const footer = document.createElement('div');
  footer.className = 'ph-footer';
  footer.textContent = typeof getFirmaFooter === 'function'
    ? getFirmaFooter(firma)
    : '';
  page.appendChild(footer);

  return page;
}

function measureLetterheadContentHeight(contentNodes, firma, modelName, measureHost) {
  const clones = contentNodes.map((node) => node.cloneNode(true));
  const page = buildLetterheadPage({
    firma,
    modelName,
    pageNumber: null,
    content: clones
  });

  measureHost.appendChild(page);
  const pageContent = page.querySelector('.page-content');
  const height = pageContent ? pageContent.scrollHeight : 0;
  page.remove();
  return height;
}

function buildSectionWithTableRows(sectionTemplate, tableTemplate, rowElements, includeIntro) {
  const section = document.createElement('div');
  section.className = sectionTemplate.className;
  if (sectionTemplate.dataset.continuedSuffix) {
    section.dataset.continuedSuffix = sectionTemplate.dataset.continuedSuffix;
  }

  const headingSrc = sectionTemplate.querySelector('.doc-h2');
  if (headingSrc) section.appendChild(headingSrc.cloneNode(true));

  if (includeIntro) {
    const introSrc = sectionTemplate.querySelector('.doc-p');
    if (introSrc) section.appendChild(introSrc.cloneNode(true));
  }

  const table = tableTemplate.cloneNode(true);
  const tbody = table.querySelector('tbody');
  if (tbody) {
    tbody.replaceChildren();
    for (const row of rowElements) tbody.appendChild(row.cloneNode(true));
  }
  section.appendChild(table);
  return section;
}

function splitTableSectionNode(node, firma, modelName, measureHost) {
  const table = node.querySelector('table.doc-table');
  const tbody = table?.querySelector('tbody');
  if (!tbody) return [node];

  const rows = [...tbody.querySelectorAll('tr')];
  if (!rows.length) return [node];

  if (measureLetterheadContentHeight([node], firma, modelName, measureHost) <= LETTERHEAD_CONTENT_MAX_HEIGHT) {
    return [node];
  }

  const tableTemplate = table.cloneNode(true);
  const emptyBody = tableTemplate.querySelector('tbody');
  if (emptyBody) emptyBody.replaceChildren();

  const continuedSuffix = node.dataset.continuedSuffix || ' (cont.)';
  const baseTitle = node.querySelector('.doc-h2')?.textContent || '';
  const parts = [];
  let rowIndex = 0;
  let isFirst = true;

  while (rowIndex < rows.length) {
    const chunk = [];

    while (rowIndex < rows.length) {
      chunk.push(rows[rowIndex]);
      const section = buildSectionWithTableRows(node, tableTemplate, chunk, isFirst);
      const height = measureLetterheadContentHeight([section], firma, modelName, measureHost);

      if (height > LETTERHEAD_CONTENT_MAX_HEIGHT && chunk.length > 1) {
        chunk.pop();
        break;
      }

      rowIndex += 1;
    }

    if (!chunk.length && rowIndex < rows.length) {
      chunk.push(rows[rowIndex]);
      rowIndex += 1;
    }

    const section = buildSectionWithTableRows(node, tableTemplate, chunk, isFirst);
    if (!isFirst) {
      const heading = section.querySelector('.doc-h2');
      if (heading) heading.textContent = `${baseTitle}${continuedSuffix}`;
    }

    parts.push(section);
    isFirst = false;
  }

  return parts.length ? parts : [node];
}

function expandSplittableContentNodes(nodes, firma, modelName, measureHost) {
  const expanded = [];
  for (const node of nodes) {
    expanded.push(...splitTableSectionNode(node, firma, modelName, measureHost));
  }
  return expanded;
}

function buildLetterheadPages({ firma, modelName, startPageNumber, content }) {
  let nodes = (Array.isArray(content) ? content : [content]).filter((node) => node instanceof Node);
  if (!nodes.length) return [];

  const measureHost = document.createElement('div');
  measureHost.className = 'letterhead-measure-host';
  measureHost.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;visibility:hidden;pointer-events:none;';
  document.body.appendChild(measureHost);

  nodes = expandSplittableContentNodes(nodes, firma, modelName, measureHost);

  const pages = [];
  let currentNodes = [];
  let pageNumber = startPageNumber ?? 1;

  try {
    for (const node of nodes) {
      const trialNodes = [...currentNodes, node];
      const height = measureLetterheadContentHeight(trialNodes, firma, modelName, measureHost);

      if (height > LETTERHEAD_CONTENT_MAX_HEIGHT && currentNodes.length > 0) {
        pages.push(buildLetterheadPage({
          firma,
          modelName,
          pageNumber: pageNumber++,
          content: currentNodes
        }));
        currentNodes = [node];
      } else if (height > LETTERHEAD_CONTENT_MAX_HEIGHT && currentNodes.length === 0) {
        pages.push(buildLetterheadPage({
          firma,
          modelName,
          pageNumber: pageNumber++,
          content: [node]
        }));
        currentNodes = [];
      } else {
        currentNodes.push(node);
      }
    }

    if (currentNodes.length) {
      pages.push(buildLetterheadPage({
        firma,
        modelName,
        pageNumber: pageNumber++,
        content: currentNodes
      }));
    }
  } finally {
    measureHost.remove();
  }

  return pages;
}
