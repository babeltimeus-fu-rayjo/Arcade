/**
 * Built-in pictures for the jigsaw, as inline SVG so the site needs no image
 * files. Each has explicit width/height so every browser rasterises it for canvas.
 */
const W = 1200;
const H = 800;
const wrap = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 600 400">${inner}</svg>`;

export const PICTURES = [
  {
    id: 'meadow',
    name: 'Meadow treasure',
    svg: wrap(`
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a8dff"/><stop offset="1" stop-color="#c08cff"/></linearGradient>
        <linearGradient id="hillA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fe09c"/><stop offset="1" stop-color="#2fae6d"/></linearGradient>
        <linearGradient id="hillB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fc984"/><stop offset="1" stop-color="#1f8f57"/></linearGradient>
      </defs>
      <rect width="600" height="400" fill="url(#sky)"/>
      <circle cx="470" cy="110" r="60" fill="#ffd86b"/><circle cx="470" cy="110" r="78" fill="#ffd86b" opacity="0.25"/>
      <g fill="#fff" opacity="0.92">
        <ellipse cx="140" cy="120" rx="58" ry="24"/><ellipse cx="175" cy="105" rx="42" ry="26"/><ellipse cx="105" cy="112" rx="34" ry="20"/>
        <ellipse cx="360" cy="70" rx="44" ry="18"/><ellipse cx="385" cy="60" rx="30" ry="18"/>
      </g>
      <path d="M0 300 Q150 200 300 290 T600 260 V400 H0Z" fill="url(#hillA)"/>
      <path d="M0 345 Q200 265 400 345 T600 325 V400 H0Z" fill="url(#hillB)"/>
      <g transform="translate(262 236)">
        <rect x="0" y="16" width="76" height="52" rx="7" fill="#8a5a2b"/><rect x="0" y="6" width="76" height="24" rx="9" fill="#a86f36"/>
        <rect x="30" y="28" width="16" height="16" rx="3" fill="#ffd86b"/><rect x="0" y="30" width="76" height="4" fill="#6b4420"/>
      </g>
      <g fill="#ff5d73"><circle cx="90" cy="330" r="7"/><circle cx="130" cy="352" r="6"/><circle cx="500" cy="338" r="7"/><circle cx="545" cy="362" r="6"/></g>
      <g fill="#ffd86b"><circle cx="60" cy="362" r="5"/><circle cx="450" cy="300" r="5"/><circle cx="180" cy="315" r="5"/></g>`),
  },
  {
    id: 'space',
    name: 'Rocket ride',
    svg: wrap(`
      <defs><linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1030"/><stop offset="1" stop-color="#3a2a7a"/></linearGradient></defs>
      <rect width="600" height="400" fill="url(#night)"/>
      <g fill="#fff">
        <circle cx="40" cy="60" r="2.5"/><circle cx="120" cy="30" r="2"/><circle cx="200" cy="80" r="3"/><circle cx="260" cy="20" r="2"/><circle cx="380" cy="40" r="2.5"/>
        <circle cx="560" cy="60" r="2"/><circle cx="520" cy="230" r="3"/><circle cx="580" cy="300" r="2"/><circle cx="60" cy="180" r="2"/><circle cx="160" cy="220" r="2.5"/>
        <circle cx="420" cy="330" r="2"/><circle cx="480" cy="370" r="2.5"/><circle cx="220" cy="360" r="2"/><circle cx="330" cy="30" r="2"/><circle cx="140" cy="140" r="1.8"/>
      </g>
      <circle cx="470" cy="120" r="55" fill="#ff9f6b"/><circle cx="450" cy="105" r="14" fill="#ffb98c" opacity="0.8"/>
      <ellipse cx="470" cy="125" rx="96" ry="18" fill="none" stroke="#ffd86b" stroke-width="9" opacity="0.9" transform="rotate(-14 470 125)"/>
      <circle cx="90" cy="300" r="46" fill="#e8ecf7"/><circle cx="75" cy="290" r="9" fill="#c9d0e3"/><circle cx="106" cy="315" r="6" fill="#c9d0e3"/><circle cx="98" cy="282" r="4" fill="#c9d0e3"/>
      <path d="M300 90 C340 130 345 210 330 270 H270 C255 210 260 130 300 90Z" fill="#f4f6ff"/>
      <path d="M300 90 C315 105 325 130 330 160 H270 C275 130 285 105 300 90Z" fill="#ff5d73"/>
      <circle cx="300" cy="185" r="21" fill="#4fa3ff" stroke="#2a3150" stroke-width="6"/>
      <path d="M270 232 L232 288 L270 272Z" fill="#ff5d73"/><path d="M330 232 L368 288 L330 272Z" fill="#ff5d73"/>
      <path d="M283 270 Q300 345 317 270Z" fill="#ffd86b"/><path d="M291 270 Q300 318 309 270Z" fill="#ff8c42"/>`),
  },
  {
    id: 'sea',
    name: 'Under the sea',
    svg: wrap(`
      <defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3ec9ff"/><stop offset="1" stop-color="#0b4ea8"/></linearGradient></defs>
      <rect width="600" height="400" fill="url(#sea)"/>
      <g fill="none" stroke="#fff" stroke-width="2" opacity="0.6"><circle cx="150" cy="90" r="6"/><circle cx="170" cy="60" r="4"/><circle cx="500" cy="150" r="7"/><circle cx="520" cy="115" r="4"/><circle cx="330" cy="60" r="5"/></g>
      <path d="M0 340 Q150 320 300 345 T600 335 V400 H0Z" fill="#f0d9a6"/>
      <path d="M80 345 C60 305 100 285 80 245 C60 205 100 195 90 155" stroke="#2fae6d" stroke-width="11" fill="none" stroke-linecap="round"/>
      <path d="M520 345 C540 305 500 290 520 250 C540 210 505 200 515 165" stroke="#3fc984" stroke-width="11" fill="none" stroke-linecap="round"/>
      <ellipse cx="220" cy="150" rx="55" ry="32" fill="#ff8c42"/><path d="M270 150 L312 118 V182Z" fill="#ff8c42"/>
      <path d="M226 120 v60 M246 124 v52" stroke="#fff" stroke-width="8" opacity="0.75"/><circle cx="198" cy="142" r="6" fill="#1a1a2e"/>
      <ellipse cx="420" cy="235" rx="38" ry="22" fill="#ffd86b"/><path d="M455 235 L487 213 V257Z" fill="#ffd86b"/><circle cx="405" cy="229" r="4.5" fill="#1a1a2e"/>
      <ellipse cx="330" cy="290" rx="26" ry="15" fill="#ff5d73"/><path d="M304 290 L282 276 V304Z" fill="#ff5d73"/><circle cx="341" cy="286" r="3.5" fill="#1a1a2e"/>
      <path d="M150 352 l12 -22 l12 22 l-12 8Z" fill="#ff9f6b"/><circle cx="420" cy="352" r="10" fill="#c9d0e3"/>`),
  },
];

export const pictureUrl = (picture) => `data:image/svg+xml;utf8,${encodeURIComponent(picture.svg)}`;

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the picture'));
    img.src = src;
  });
}
