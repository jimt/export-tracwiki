// @ts-check
/*
export-tracwiki -- export trac wiki as static HTML

Copyright 2021 James Tittsler
@license MIT
*/

// fetch wiki TitleIndex page
// for each page
//   fetch page
//   strip unwanted header, footer, etc.
//   write to site directory

const arg = require('arg');
const axios = require('axios').default;
const process = require("process");
const cheerio = require("cheerio");
const fs = require("fs");
const os = require("os");

const args = arg({
  '--wiki': Boolean,
});

const PATHPREFIX = './public';

const removeThese = [
  '#metanav', '#mainnav', '#ctxtnav', '#search',
  '#footer', '#altlinks', '.trac-modifiedby',
  'link[rel="search"]', 'link[rel="help"]', 'link[rel="alternate"]',
  'link[rel="start"]', 'link[rel="shortcut icon"]', '#trac-noscript',
  'meta[http-equiv]', 'meta[name="ROBOTS"]',
  'script:not([src])', 'script[src$="/site/js/babel.js"]',
  'script[src$="/site/js/search.js"]',
  'span[class="icon"]', 'a[class="trac-rawlink"]'
];
/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function processPage(baseURL, pagePath, opt) {
  let page;
  let sitePath = `${PATHPREFIX}/${pagePath}`;
  try {
    pagePath = decodeURIComponent(pagePath);
  } catch (e) {
    console.error(`error decoding ${pagePath}`);
    process.exit(2);
  }
  fs.mkdirSync(sitePath, {recursive: true});
  try {
    console.log(`=======${baseURL}${pagePath}=========`);
    page = await axios.get(`${baseURL}${pagePath}`);
  } catch (error) {
    console.error(`error fetching ${baseURL}${pagePath}`, error);
    return;
  }

  // pretend we are html5
  let pageContents = page.data;
  pageContents = pageContents.replace(/xmlns="[^"]+"/, 'lang="en"');
  let $ = cheerio.load(pageContents);
  $(removeThese.join(',')).remove();
  // remove #acl lines
  $('p:contains("#acl ")').remove();
  // remove comments from head
  let head = $('head').html();
  head = head.replace(/<!--\s*[\s\S]*?-->\s*/, '');
  $('head').empty().append(head);
  $('head').prepend('<meta charset="utf-8">');
  $('link[rel="icon"]').removeAttr('type');
  $('script[src^="http"]').each(function() {
    let src = $(this).attr('src');
    src = src.replace(/^https:\/\/exelearning.org/i, '');
    $(this).attr('src', src);
  });
  $('link[href^="http"]').each(function() {;
    let href = $(this).attr('href');
    href = href.replace(/^https:\/\/exelearning.org/i, '');
    $(this).attr('href', href);
  });
  // simplified replacement inline script
  $('head').append(`<script>jQuery(document).ready(function($) {
     $('.foldable').enableFolding(true, true); });
  </script>\n`);
  if (opt.nowiki) {
    $('a').each(function(){
      let href = $(this).attr('href');
      if (href && href.startsWith('/wiki')) {
        $(this).attr('href', href.replace('/wiki', '') || '/');
      }
    });
  }
  try {
    fs.writeFileSync(`${sitePath}/index.html`, $.html());
  } catch (e) {
    console.error('Unable to write .${pagePath}/index.html');
    process.exit(1);
  }
}

async function wiki(baseURL, opt) {
  let pages = [];
  try {
    let index = await axios.get(`${baseURL}/wiki/TitleIndex`);
    let $ = cheerio.load(index.data);
    $('li>a', '.titleindex').each(function(i,e) {
      pages.push($(this).attr('href'));
      console.log($(this).attr('href'));
    })
  } catch (error) {
    console.error(error);
  }
  for (let page of pages) {
    await sleep(1000);
    await processPage(baseURL, page, opt);
  }

}

function usage() {
  console.error('{--wiki} {--output DIR} WIKIURL');
  process.exit(1);
}

if (args._.length != 1) {
  usage();
}
let baseURL = args._[0].replace(/\/$/, '');

fs.rmdirSync('./site', {recursive: true});
wiki(baseURL, {nowiki: args['--wiki']});
