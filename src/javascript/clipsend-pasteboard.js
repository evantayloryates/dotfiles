// Capture clipboard bytes once. Run with `osascript -l JavaScript`:
//   capture <temporary-path> <image-format>
// Returns files\n<paths>, image, text, data\n<extension>, or empty.
// The temporary path holds the selected payload, never clipboard text on stdout.
ObjC.import('AppKit');

const FILE_TYPES = { tiff: 0, bmp: 1, gif: 2, jpeg: 3, png: 4 };
const RAW_TYPES = {
  png: 'public.png', tiff: 'public.tiff', jpeg: 'public.jpeg',
  gif: 'com.compuserve.gif', bmp: 'com.microsoft.bmp'
};

// Bound JXA string bridging to 256 bytes. Full image decoding is reserved for
// conversion; the native text validator does not copy large strings into JS.
function header(data) {
  const prefix = data.subdataWithRange($.NSMakeRange(0, Math.min(Number(data.length), 256)));
  return $.NSString.alloc.initWithDataEncoding(prefix, $.NSISOLatin1StringEncoding).js;
}

function imageFormat(bytes) {
  if (bytes.startsWith('\x89PNG\r\n\x1a\n')) return 'png';
  if (bytes.startsWith('\xff\xd8\xff')) return 'jpeg';
  if (/^GIF8[79]a/.test(bytes)) return 'gif';
  if (bytes.startsWith('II*\0') || bytes.startsWith('MM\0*')) return 'tiff';
  if (bytes.startsWith('BM') && bytes.length >= 26 && [12, 40, 52, 56, 108, 124].includes(bytes.charCodeAt(14))
      && bytes.slice(15, 18) === '\0\0\0') return 'bmp';
  if (bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP') return 'webp';
  if (bytes.slice(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1|avif|avis)$/.test(bytes.slice(8, 12))) {
    return 'heif';
  }
  return null;
}

function binaryFormat(bytes) {
  if (bytes.startsWith('%PDF-')) return 'pdf';
  if (bytes.startsWith('PK\x03\x04') || bytes.startsWith('PK\x05\x06')) return 'zip';
  if (bytes.startsWith('\x1f\x8b')) return 'gz';
  if (bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WAVE') return 'wav';
  return null;
}

function convertImage(data, fmt) {
  const rep = $.NSBitmapImageRep.imageRepWithData(data);
  if (rep.isNil()) throw new Error('could not decode clipboard image; copy the image or file again');
  const encoded = rep.representationUsingTypeProperties(FILE_TYPES[fmt], $({}));
  if (encoded.isNil()) throw new Error(`could not encode image as ${fmt}`);
  return encoded;
}

function capture(pb, path, fmt) {
  if (!(fmt in FILE_TYPES)) throw new Error(`unsupported format: ${fmt}`);
  const generation = Number(pb.changeCount);
  const types = pb.types.isNil() ? [] : pb.types.js.map((t) => t.js);
  function unchanged() {
    if (Number(pb.changeCount) !== generation) throw new Error('clipboard changed during capture; run cs again');
  }
  function read(type) {
    const data = pb.dataForType(type);
    unchanged();
    if (data.isNil()) throw new Error('clipboard data unavailable; copy it again');
    return data;
  }
  function save(data, result) {
    unchanged();
    if (!data.writeToFileAtomically(path, true)) throw new Error(`could not write ${path}`);
    return result;
  }
  function saveImage(data) {
    // Matching known signatures take the direct path. Do not decode every PNG
    // or JPEG just to prove its type, or trust an advertised type without bytes.
    const sourceFormat = imageFormat(header(data));
    return save(sourceFormat === fmt ? data : convertImage(data, fmt), 'image');
  }
  function accompanyingImage() {
    const common = types.includes(RAW_TYPES[fmt]) ? RAW_TYPES[fmt]
      : types.find((t) => Object.values(RAW_TYPES).includes(t));
    if (common) return read(common);
    // Ask AppKit about less common formats only when no usual raster type is
    // offered. Ordinary text and PNG/JPEG do not pay for that discovery.
    const imageTypes = $.NSImage.imageTypes.js.map((t) => t.js);
    const type = types.find((t) => imageTypes.includes(t));
    return type ? read(type) : null;
  }

  // Finder's file URLs win over both its filename text and preview/icon image.
  const urls = pb.readObjectsForClassesOptions(
    $([$.NSURL]), $({ NSPasteboardURLReadingFileURLsOnlyKey: true })
  );
  unchanged();
  const paths = urls.isNil() ? [] : urls.js.map((u) => u.path.js);
  if (paths.length) return ['files', ...paths].join('\n');

  // macOS appends synthesized UTF-8 after original UTF-16. Prefer the first
  // offered text representation so its BOM and original encoding survive.
  const textType = types.find((t) => ['public.utf8-plain-text', 'public.utf16-external-plain-text', 'NSStringPboardType'].includes(t))
    || (types.includes('public.data') ? 'public.data' : null);
  if (textType) {
    const data = read(textType);
    if (Number(data.length)) {
      const bytes = header(data);
      if (imageFormat(bytes)) return saveImage(data);
      const binary = binaryFormat(bytes);
      if (binary) return save(data, 'data\n' + binary);
      let encoding = $.NSUTF8StringEncoding;
      if (bytes.startsWith('\xff\xfe\0\0') || bytes.startsWith('\0\0\xfe\xff')) encoding = $.NSUTF32StringEncoding;
      else if (textType === 'public.utf16-external-plain-text' || bytes.startsWith('\xff\xfe') || bytes.startsWith('\xfe\xff')) encoding = $.NSUTF16StringEncoding;
      const text = $.NSString.alloc.initWithDataEncoding(data, encoding);
      // Sample decoded characters so legitimate UTF-16 NUL bytes are harmless.
      const prefix = text.isNil() ? '' : text.substringToIndex(Math.min(Number(text.length), 256)).js;
      const binaryText = text.isNil() || /[\x00-\x08\x0b\x0e-\x1f]/.test(prefix);
      if (!binaryText) return save(data, 'text'); // spreadsheet text beats its preview
      const image = accompanyingImage();
      if (image) return saveImage(image);
      // Replacement characters near a damaged image marker are irreversible.
      // Do not reject ordinary prose merely for containing U+FFFD.
      if (prefix.includes('\ufffd') && /JFIF\x00|Exif\x00|PNG\r\n\x1a\n/.test(prefix)) {
        throw new Error('clipboard image bytes were already converted to text; use Finder Copy or Preview Copy, or cs <name> --from <original-file>');
      }
      return save(data, 'data\nbin');
    }
  }
  const image = accompanyingImage();
  if (image) return saveImage(image);
  unchanged();
  return 'empty';
}

function run(argv) {
  if (argv[0] !== 'capture' || argv.length !== 3) {
    throw new Error('usage: clipsend-pasteboard.js capture <temporary-path> <image-format>');
  }
  return capture($.NSPasteboard.generalPasteboard, argv[1], argv[2]);
}
