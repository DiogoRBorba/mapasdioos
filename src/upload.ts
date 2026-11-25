export async function imagePayload(file: File, size = 6000) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Escolha JPG, PNG ou WebP.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Escolha uma imagem de até 20 MB.');
  let blob: Blob = file;
  if (file.size > 3 * 1024 * 1024) {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(bitmap.width*scale)); canvas.height = Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for (const quality of [.94,.86,.76]) {
        blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível preparar esta imagem.')), 'image/webp',quality));
        if(blob.size <= 3*1024*1024)break;
      }
    } finally {bitmap.close();}
  }
  if(blob.size > 3*1024*1024)throw new Error('A imagem ainda é muito grande. Envie uma versão menor.');
  return new Promise<string>((resolve,reject) => {const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));reader.readAsDataURL(blob);});
}
