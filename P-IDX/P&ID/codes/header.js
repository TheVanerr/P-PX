/* Antet (letterhead) modülü — numaralı sayfaların üst kenarına yerleşir. */

const HEADER_BRANDS = {
  DOLFIN: {
    type: 'text',
    name: 'DOLFIN',
    sub: 'Makine Sanayi',
    footer: 'CNK ELEKTRONİK MAKİNE SAN A.Ş.',
    color: '#ff0000'
  },
  ENVA: {
    type: 'logo',
    logo: '../assets/logos/enva.svg',
    footer: 'Enva Specialist Waste Ltd',
    color: '#007938'
  },
  VICO: {
    type: 'logo',
    logo: '../assets/logos/vico.png',
    footer: 'vico AB',
    color: '#C41E3A'
  },
  KSYSTEM: {
    type: 'logo',
    logo: '../assets/logos/ksystem.png',
    footer: 'K.SYSTEM GMBH',
    color: '#1B04AE',
    logoHeight: 22,
    logoMaxWidth: 148
  }
};

function getFirmaFooter(variant) {
  const brand = HEADER_BRANDS[variant] || HEADER_BRANDS.DOLFIN;
  return brand.footer || 'CNK ELEKTRONİK MAKİNE SAN A.Ş.';
}

function buildHeader(variant, model) {
  const brand = HEADER_BRANDS[variant] || HEADER_BRANDS.DOLFIN;

  const header = document.createElement('div');
  header.className = 'page-header';
  header.style.setProperty('--brand-color', brand.color);

  const left = document.createElement('div');
  left.className = 'ph-brand';

  if (brand.type === 'logo') {
    left.classList.add('ph-brand-logo');
    const img = document.createElement('img');
    img.className = 'ph-logo';
    img.src = brand.logo;
    img.alt = variant;
    if (brand.logoHeight) img.style.height = brand.logoHeight + 'px';
    if (brand.logoMaxWidth) img.style.maxWidth = brand.logoMaxWidth + 'px';
    left.appendChild(img);
    if (brand.sub) {
      const sub = document.createElement('span');
      sub.className = 'ph-sub';
      sub.textContent = brand.sub;
      left.appendChild(sub);
    }
  } else {
    const name = document.createElement('span');
    name.className = 'ph-name';
    name.textContent = brand.name;
    const sub = document.createElement('span');
    sub.className = 'ph-sub';
    sub.textContent = brand.sub;
    left.appendChild(name);
    left.appendChild(sub);
  }

  const right = document.createElement('div');
  right.className = 'ph-model';
  right.textContent = (model || '').toUpperCase();

  header.appendChild(left);
  header.appendChild(right);
  return header;
}
