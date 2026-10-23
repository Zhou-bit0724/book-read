'use strict';

const library = require('../lib/library');

(async () => {
  const data = await library.refresh();
  console.log(`扫描目录: ${data.directory}`);
  console.log(`导入书籍: ${data.books.length} 本`);
  for (const book of data.books) {
    console.log(`- ${book.title}${book.author ? ` / ${book.author}` : ''} (${book.format}, ${book.chapterCount} 章)`);
  }
  if (data.errors.length) {
    console.warn('\n以下文件未能导入:');
    for (const item of data.errors) console.warn(`- ${item.file}: ${item.error}`);
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
