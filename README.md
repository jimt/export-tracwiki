# export-tracwiki

This is a simple JavaScript
[Node.js](https://nodejs.org/en/) program
that given the URL of the eXe [trac](https://trac.edgewall.org/)
wiki TitleIndex produces a static HTML version of the most
recent revision of the site.

## Use

`node export-tracwiki {--wiki} URL`

<dl>
  <dt>--wiki</dt>
  <dd>remove `/wiki` from resulting pages and URLs</dd>
</dl>

## License

MIT

