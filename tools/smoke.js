'use strict';

const site = require('../lib/site');

(async () => {
  const home = await site.getHome();
  console.log('home', JSON.stringify({
    sections: home.sections.map((s) => [s.title, s.books.length, s.books[0] && s.books[0].title]),
    sugoi: home.sugoi.books.length,
    years: home.sugoi.years.slice(0, 5),
  }));

  const book = await site.getBook(1763);
  console.log('book', JSON.stringify({
    title: book.title,
    author: book.author,
    category: book.category,
    status: book.status,
    words: book.words,
    chapters: book.chapterCount,
    volumes: book.volumes.length,
    first: book.firstChapter,
    latest: book.latest,
    cover: book.cover,
    related: book.related.length,
  }));

  if (!book.firstChapter) throw new Error('no first chapter');
  const chapter = await site.getChapter(1763, book.firstChapter.id);
  console.log('chapter', JSON.stringify({
    title: chapter.title,
    bookTitle: chapter.bookTitle,
    words: chapter.words,
    prev: chapter.prev,
    next: chapter.next,
    images: chapter.images.length,
    head: chapter.text.slice(0, 60),
    html: chapter.content.slice(0, 100),
  }));

})().catch((error) => {
  console.error('ERR', error);
  process.exit(1);
});
