// @ts-check
/*
export-tracwiki -- export trac wiki as static HTML

Copyright 2021 James Tittsler
@license MIT
*/

// fetch wiki TitleIndex page
// for each page
//   fetch page
//   strip unwanted header, menus, etc.
//   write to site directory

const arg = require('arg');
const axios = require('axios').default;
const process = require("process");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const args = arg({
  '--wiki': Boolean,
});

const PATHPREFIX = './public';
const PROJECTLOGO = '/site/exe.png';

const skipPages = new RegExp('/wiki/((BadContent)|(Trac.*)|(Wiki(?!Start).*))');

const removeThese = [
  '#metanav', '#mainnav', '#ctxtnav', '#search',
  '#altlinks', '.trac-modifiedby',
  'link[rel="search"]', 'link[rel="help"]', 'link[rel="alternate"]',
  'link[rel="start"]', 'link[rel="shortcut icon"]', '#trac-noscript',
  'meta[http-equiv]', 'meta[name="ROBOTS"]',
  'script:not([src])', 'script[src$="/site/js/babel.js"]',
  'script[src$="/site/js/search.js"]',
  'span.icon', 'a.trac-rawlink'
];

var fetchErrors = [];

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/**
 * map old fetchable path to new site path
 * @param {string} asset
 */
function assetStoragePath(asset) {
  let path = asset.replace(/^\/raw-attachment\//, '/attachment/');
  path = path.replace('/chrome/site/your_project_logo.png', PROJECTLOGO);
  return PATHPREFIX + path;
}

async function processPage(baseURL, pagePath, opt) {
  let page;
  let assets = [];
  let sitePath = `${PATHPREFIX}/${pagePath}`;
  try {
    pagePath = decodeURIComponent(pagePath);
  } catch (e) {
    console.error(`error decoding ${pagePath}`);
    process.exit(2);
  }
  fs.mkdirSync(sitePath, {recursive: true});
  try {
    console.log(`${baseURL}${pagePath}`);
    page = await axios.get(`${baseURL}${pagePath}`);
  } catch (error) {
    console.error(`error fetching ${baseURL}${pagePath}`, error);
    fetchErrors.push(pagePath);
    return;
  }

  // claim to be html5
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
  $('#attachments p:contains("Download all attachments as:")').remove();

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

  // show dates rather than DateTime function
  $('s.missing').each(function() {
    let re = /\s*DateTime\(()\)/.exec($(this).text());
    if (re) {
      $(this).replaceWith(re[1]);
    }
  });

  // find remaining assets
  $('link[rel="stylesheet"],#attachments a[href^="/attachment/"]').each(function() {
    let href = $(this).attr("href");
    if (href && !href.startsWith("http")) {
      assets.push(href);
      if (href.endsWith('wiki.css')) {
        assets.push(href.replace('wiki.css', 'code.css'));
      }
    }
  });
  $('script[src],img').each(function() {
    let src = $(this).attr("src");
    if (src && !src.startsWith("http")) {
      assets.push(src);
    }
  });

  $('img[src="/chrome/site/your_project_logo.png"]').attr('src', PROJECTLOGO);
  // collapse attachment and raw-attachments in body and #attachments
  $('img[src^="/raw-attachment/"]').each(function() {
    let src = $(this).attr('src')
                     .replace(/^\/raw-attachment\//, '/attachment/');
    $(this).attr('src', src);

  });
  $('li', '#attachments').each(function() {
    let li = $(this).html().replace(/added by[\s\S]+<em>anonymous<\/em>/, '');
    $(this).html(li);
  });
  $('a.timeline').each(function(){
    let ts = $(this).attr('title').replace(/[^0-9]+([-0-9]+).*/, '$1');
    $(this).replaceWith(ts);
  });
  $('#header').replaceWith(function() {
    return $("<header />").append($(this).contents());
  });
  $('#footer').replaceWith(`<footer>
  <ul class="footer-copyright">
    <li>Copyright 2004-2005 University of Auckland<br>
    Copyright 2004-2021 <a href="https://eXeLearning.org/">eXe Project</a><br>
    <a rel="license" href="http://creativecommons.org/licenses/by/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by/4.0/88x31.png" /></a><br /><small>This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</small></a>.</li>
  </ul>
  <ul class="footer-links">
    <li><a href="/wiki/About/">About</a></li>
    <li><a href="/wiki/TitleIndex/">Site Index</a></li>
    <li><a href="https://sourceforge.net/projects/exe/">Source<b>Forge</b></a> (Source code)</li>
  </ul>
  </footer>`);

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

  // fetch the assets (that we don't have)
  for (let asset of assets) {
    let assetPath = assetStoragePath(asset);
    let assetDir = path.dirname(assetPath);
    try {
      fs.accessSync(assetPath);
      console.log(`--- ${asset}`);
    } catch (e) {
      let res;
      console.log(`+++ ${asset}`);
      fs.mkdirSync(assetDir, {recursive: true});
      try {
        // always fetch the raw attachment, regardless of what is requested
        let fetchPath = baseURL + asset.replace(/^\/attachment\//, '/raw-attachment/');
        res = await axios.get(fetchPath, {responseType: 'stream'});
        res.data.pipe(fs.createWriteStream(assetPath));
      } catch (error) {
        console.error(`error fetching asset ${asset}`, error);
        fetchErrors.push(asset);
        return;
      }
    }
  }
}

async function wiki(baseURL, opt) {
  let pages = [];
  try {
    let index = await axios.get(`${baseURL}/wiki/TitleIndex`);
    let $ = cheerio.load(index.data);
    $('li>a', '.titleindex').each(function(i,e) {
      pages.push($(this).attr('href'));
    })
  } catch (error) {
    console.error(error);
  }
  for (let page of pages) {
    if (page.match(skipPages)) {
      console.log(`${page} >>> SKIPPED`);
      continue;
    }
    await sleep(1000);
    await processPage(baseURL, page, opt);
  }
  console.log(`errors: ${fetchErrors.length}`);
  if (fetchErrors.length) {
    console.error(fetchErrors);
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

wiki(baseURL, {nowiki: args['--wiki']});