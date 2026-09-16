// Pasteboard bridge for clipsend. Run with `osascript -l JavaScript`.
//
//   inspect                   first line is the kind (files | image | text | empty);
//                             for files, each following line is a source path
//   write-image <path> <fmt>  write the pasteboard image to <path> as
//                             png | jpeg | tiff | gif | bmp
//
// `pbpaste` only speaks text, so a copied Finder file or image comes back as a
// filename or nothing at all. Finder puts the filename as text and the file
// icon as TIFF next to the file URL, so file URLs are checked first. Apps like
// Excel and Numbers put a rendered picture next to the copied text, so image
// data only wins when there is no text to take instead.
ObjC.import('AppKit');

const FILE_TYPES = { tiff: 0, bmp: 1, gif: 2, jpeg: 3, png: 4 };
const RAW_TYPES = { png: 'public.png', tiff: 'public.tiff', jpeg: 'public.jpeg', gif: 'com.compuserve.gif' };

function inspect(pb) {
  const urls = pb.readObjectsForClassesOptions(
    $([$.NSURL]),
    $({ NSPasteboardURLReadingFileURLsOnlyKey: true })
  );
  const paths = urls.isNil() ? [] : urls.js.map((u) => u.path.js);
  if (paths.length) return ['files', ...paths].join('\n');

  const types = pb.types.isNil() ? [] : pb.types.js.map((t) => t.js);
  const text = pb.stringForType($.NSPasteboardTypeString);
  if (!text.isNil() && text.length > 0) return 'text';

  const imageTypes = $.NSImage.imageTypes.js.map((t) => t.js);
  if (types.some((t) => imageTypes.includes(t))) return 'image';
  return 'empty';
}

function writeImage(pb, path, fmt) {
  if (!(fmt in FILE_TYPES)) throw new Error(`unsupported format: ${fmt}`);

  // Keep the original bytes when the pasteboard already holds the target format.
  let data = RAW_TYPES[fmt] ? pb.dataForType(RAW_TYPES[fmt]) : $();
  if (data.isNil()) {
    const image = $.NSImage.alloc.initWithPasteboard(pb);
    if (image.isNil()) throw new Error('no image on the clipboard');
    const rep = $.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation);
    if (rep.isNil()) throw new Error('could not decode clipboard image');
    data = rep.representationUsingTypeProperties(FILE_TYPES[fmt], $({}));
    if (data.isNil()) throw new Error(`could not encode image as ${fmt}`);
  }
  if (!data.writeToFileAtomically(path, true)) throw new Error(`could not write ${path}`);
  return path;
}

function run(argv) {
  const pb = $.NSPasteboard.generalPasteboard;
  switch (argv[0]) {
    case 'inspect':
      return inspect(pb);
    case 'write-image':
      return writeImage(pb, argv[1], argv[2]);
    default:
      throw new Error('usage: clipsend-pasteboard.js inspect | write-image <path> <fmt>');
  }
}
