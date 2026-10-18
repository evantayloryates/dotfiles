// Prefer the original file on the pasteboard. PNG encoding remains an in-memory
// image fallback; neither mode creates a temporary file.
ObjC.import('AppKit');

function copyFile(path, pasteboard) {
  const url = $.NSURL.fileURLWithPath(path).URLByResolvingSymlinksInPath;
  const target = ObjC.unwrap(url.path);
  if (!$.NSFileManager.defaultManager.isReadableFileAtPath(target)) {
    throw new Error('file is not readable');
  }

  pasteboard.clearContents;
  if (!pasteboard.writeObjects($([url]))) {
    throw new Error('could not copy file');
  }
  const urls = pasteboard.readObjectsForClassesOptions(
    $([$.NSURL]), $({ NSPasteboardURLReadingFileURLsOnlyKey: true })
  );
  if (urls.isNil() || Number(urls.count) !== 1 || ObjC.unwrap(urls.objectAtIndex(0).path) !== target) {
    throw new Error('clipboard file readback did not match');
  }
}

function pngData(path) {
  const source = $.NSData.dataWithContentsOfFile(path);
  if (source.isNil()) throw new Error('could not read image file');

  let bitmap = $.NSBitmapImageRep.imageRepWithData(source);
  if (bitmap.isNil()) {
    // AppKit opens vector formats such as SVG through NSImage.
    const image = $.NSImage.alloc.initWithContentsOfFile(path);
    if (image.isNil()) throw new Error('could not decode image');
    const tiff = image.TIFFRepresentation;
    if (tiff.isNil()) throw new Error('could not rasterize image');
    bitmap = $.NSBitmapImageRep.imageRepWithData(tiff);
    if (bitmap.isNil()) throw new Error('could not decode rasterized image');
  }

  const png = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));
  if (png.isNil()) throw new Error('could not encode image as PNG');
  return png;
}

function copyImage(path, pasteboard) {
  const png = pngData(path); // Leave the existing clipboard alone on decode errors.
  pasteboard.clearContents;
  if (!pasteboard.setDataForType(png, $.NSPasteboardTypePNG)) {
    throw new Error('could not write PNG to clipboard');
  }
  const published = pasteboard.dataForType($.NSPasteboardTypePNG);
  if (published.isNil() || !published.isEqualToData(png)) {
    throw new Error('clipboard image readback did not match');
  }
}

function run(argv) {
  // Preserve the original one-argument PNG command for direct callers.
  if (argv.length === 1) return copyImage(argv[0], $.NSPasteboard.generalPasteboard);
  if (argv.length !== 2) throw new Error('usage: image-pasteboard.js <file|png> <path>');
  if (argv[0] === 'file') return copyFile(argv[1], $.NSPasteboard.generalPasteboard);
  if (argv[0] === 'png') return copyImage(argv[1], $.NSPasteboard.generalPasteboard);
  throw new Error('copy mode must be file or png');
}
