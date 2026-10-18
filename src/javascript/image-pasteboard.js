// Copy actual image pixels to the pasteboard as PNG data, not a path or file URL.
// Chafa has already confirmed the input renders before this helper runs.
ObjC.import('AppKit');

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
  if (argv.length !== 1) throw new Error('usage: image-pasteboard.js <image-path>');
  copyImage(argv[0], $.NSPasteboard.generalPasteboard);
}
