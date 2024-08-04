import './view.js'
import { createTOCView } from './ui/tree.js'
import { createMenu } from './ui/menu.js'
import { Overlayer } from './overlayer.js'
const { configure, ZipReader, BlobReader, TextWriter, BlobWriter } =
    await import('./vendor/zip.js')
const { EPUB } = await import('./epub.js')

// https://github.com/johnfactotum/foliate
const setSelectionHandler = (view, doc, index) => {
    const debounce = (f, wait, immediate) => {
        let timeout
        return (...args) => {
            const later = () => {
                timeout = null
                if (!immediate) f(...args)
            }
            const callNow = immediate && !timeout
            if (timeout) clearTimeout(timeout)
            timeout = setTimeout(later, wait)
            if (callNow) f(...args)
        }
    }

    const pointIsInView = ({ x, y }) =>
        x > 0 && y > 0 && x < window.innerWidth && y < window.innerHeight;

    const frameRect = (frame, rect, sx = 1, sy = 1) => {
        const left = sx * rect.left + frame.left;
        const right = sx * rect.right + frame.left;
        const top = sy * rect.top + frame.top;
        const bottom = sy * rect.bottom + frame.top;
        return { left, right, top, bottom };
    };

    const getLang = el => {
        const lang = el.lang || el?.getAttributeNS?.('http://www.w3.org/XML/1998/namespace', 'lang');
        if (lang) return lang;
        if (el.parentElement) return getLang(el.parentElement);
    };

    const getPosition = target => {
        const frameElement = (target.getRootNode?.() ?? target?.endContainer?.getRootNode?.())
            ?.defaultView?.frameElement;

        const transform = frameElement ? getComputedStyle(frameElement).transform : '';
        const match = transform.match(/matrix\((.+)\)/);
        const [sx, , , sy] = match?.[1]?.split(/\s*,\s*/)?.map(x => parseFloat(x)) ?? [];

        const frame = frameElement?.getBoundingClientRect() ?? { top: 0, left: 0 };
        const rects = Array.from(target.getClientRects());
        const first = frameRect(frame, rects[0], sx, sy);
        const last = frameRect(frame, rects.at(-1), sx, sy);
        const start = {
            point: { x: (first.left + first.right) / 2, y: first.top },
            dir: 'up',
        };
        const end = {
            point: { x: (last.left + last.right) / 2, y: last.bottom },
            dir: 'down',
        };
        const startInView = pointIsInView(start.point);
        const endInView = pointIsInView(end.point);
        if (!startInView && !endInView) return { point: { x: 0, y: 0 } };
        if (!startInView) return end;
        if (!endInView) return start;
        return start.point.y > window.innerHeight - end.point.y ? start : end;
    };

    const getSelectionRange = sel => {
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return;
        return range;
    };

    let isSelecting = false;

    doc.addEventListener('pointerdown', () => isSelecting = true);
    doc.addEventListener('pointerup', () => {
        isSelecting = false;
        const sel = doc.getSelection();
        const range = getSelectionRange(sel);
        if (!range) return;
        const pos = getPosition(range);
        const cfi = view.getCFI(index, range);
        const lang = getLang(range.commonAncestorContainer);
        const text = sel.toString();
        if (!text) {
            const newSel = range.startContainer.ownerDocument.getSelection()
            newSel.removeAllRanges()
            newSel.addRange(range)
            text = newSel.toString()
        }
        console.log({ index, range, lang, cfi, pos, text });
    });

    if (!view.isFixedLayout)
        // go to the next page when selecting to the end of a page
        // this makes it possible to select across pages
        doc.addEventListener('selectionchange', debounce(() => {
            if (!isSelecting) return
            if (view.renderer.getAttribute('flow') !== 'paginated') return
            const { lastLocation } = view
            if (!lastLocation) return
            const selRange = getSelectionRange(doc.getSelection())
            if (!selRange) return
            if (selRange.compareBoundaryPoints(Range.END_TO_END, lastLocation.range) >= 0) {
                view.next()
                console.log('next');

            }
        }, 1000))

};

const isZip = async file => {
    const arr = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    return arr[0] === 0x50 && arr[1] === 0x4b && arr[2] === 0x03 && arr[3] === 0x04
}

const isPDF = async file => {
    const arr = new Uint8Array(await file.slice(0, 5).arrayBuffer())
    return arr[0] === 0x25
        && arr[1] === 0x50 && arr[2] === 0x44 && arr[3] === 0x46
        && arr[4] === 0x2d
}

const makeZipLoader = async file => {
    configure({ useWebWorkers: false })
    const reader = new ZipReader(new BlobReader(file))
    const entries = await reader.getEntries()
    const map = new Map(entries.map(entry => [entry.filename, entry]))
    const load = f => (name, ...args) =>
        map.has(name) ? f(map.get(name), ...args) : null
    const loadText = load(entry => entry.getData(new TextWriter()))
    const loadBlob = load((entry, type) => entry.getData(new BlobWriter(type)))
    const getSize = name => map.get(name)?.uncompressedSize ?? 0
    return { entries, loadText, loadBlob, getSize }
}

const getFileEntries = async entry => entry.isFile ? entry
    : (await Promise.all(Array.from(
        await new Promise((resolve, reject) => entry.createReader()
            .readEntries(entries => resolve(entries), error => reject(error))),
        getFileEntries))).flat()

const makeDirectoryLoader = async entry => {
    const entries = await getFileEntries(entry)
    const files = await Promise.all(
        entries.map(entry => new Promise((resolve, reject) =>
            entry.file(file => resolve([file, entry.fullPath]),
                error => reject(error)))))
    const map = new Map(files.map(([file, path]) =>
        [path.replace(entry.fullPath + '/', ''), file]))
    const decoder = new TextDecoder()
    const decode = x => x ? decoder.decode(x) : null
    const getBuffer = name => map.get(name)?.arrayBuffer() ?? null
    const loadText = async name => decode(await getBuffer(name))
    const loadBlob = name => map.get(name)
    const getSize = name => map.get(name)?.size ?? 0
    return { loadText, loadBlob, getSize }
}

const isCBZ = ({ name, type }) =>
    type === 'application/vnd.comicbook+zip' || name.endsWith('.cbz')

const isFB2 = ({ name, type }) =>
    type === 'application/x-fictionbook+xml' || name.endsWith('.fb2')

const isFBZ = ({ name, type }) =>
    type === 'application/x-zip-compressed-fb2'
    || name.endsWith('.fb2.zip') || name.endsWith('.fbz')

const getView = async file => {
    let book
    if (file.isDirectory) {
        const loader = await makeDirectoryLoader(file)
        const { EPUB } = await import('./epub.js')
        book = await new EPUB(loader).init()
    }
    else if (!file.size) throw new Error('File not found')
    else if (await isZip(file)) {
        const loader = await makeZipLoader(file)
        if (isCBZ(file)) {
            const { makeComicBook } = await import('./comic-book.js')
            book = makeComicBook(loader, file)
        } else if (isFBZ(file)) {
            const { makeFB2 } = await import('./fb2.js')
            const { entries } = loader
            const entry = entries.find(entry => entry.filename.endsWith('.fb2'))
            const blob = await loader.loadBlob((entry ?? entries[0]).filename)
            book = await makeFB2(blob)
        } else {
            book = await new EPUB(loader).init()
        }
    }
    else if (await isPDF(file)) {
        const { makePDF } = await import('./pdf.js')
        book = await makePDF(file)
    }
    else {
        const { isMOBI, MOBI } = await import('./mobi.js')
        if (await isMOBI(file)) {
            const fflate = await import('./vendor/fflate.js')
            book = await new MOBI({ unzlib: fflate.unzlibSync }).open(file)
        } else if (isFB2(file)) {
            const { makeFB2 } = await import('./fb2.js')
            book = await makeFB2(file)
        }
    }
    if (!book) throw new Error('File type not supported')
    const view = document.createElement('foliate-view')
    document.body.append(view)
    await view.open(book)
    return view
}

const getCSS = ({ fontSize,
    spacing,
    fontColor,
    backgroundColor,
    justify,
    hyphenate }) => `
    @namespace epub "http://www.idpf.org/2007/ops";
    html {
        color: ${fontColor};
        background-color: ${backgroundColor};
        font-size: ${fontSize}em;
    }
    /* https://github.com/whatwg/html/issues/5426 */
    @media (prefers-color-scheme: dark) {
        a:link {
            color: lightblue;
        }
    }
    p, li, blockquote, dd, div{
        line-height: ${spacing};
        text-align: ${justify ? 'justify' : 'start'};
        -webkit-hyphens: ${hyphenate ? 'auto' : 'manual'};
        hyphens: ${hyphenate ? 'auto' : 'manual'};
        -webkit-hyphenate-limit-before: 3;
        -webkit-hyphenate-limit-after: 2;
        -webkit-hyphenate-limit-lines: 2;
        hanging-punctuation: allow-end last;
        widows: 2;
    }
    /* prevent the above from overriding the align attribute */
    [align="left"] { text-align: left; }
    [align="right"] { text-align: right; }
    [align="center"] { text-align: center; }
    [align="justify"] { text-align: justify; }

    pre {
        white-space: pre-wrap !important;
    }
    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] {
        display: none;
    }
`

const $ = document.querySelector.bind(document)

const locales = 'en'

class Reader {
    annotations = new Map()
    annotationsByCFI = new Map()
    constructor() {

    }
    async open(file, cfi) {
        this.view = await getView(file)

        await this.view.init({ lastLocation: cfi })

        this.view.addEventListener('load', this.#onLoad.bind(this))
        this.view.addEventListener('relocate', this.#onRelocate.bind(this))

        const { book } = this.view


        setStyle()
        this.view.renderer.next()

        let bookmarks = [
            { id: 1, type: 'highlight', cfi: "epubcfi(/6/8!/4/4,/1:0,/1:20)", color: 'blue', note: 'this is' },
            { id: 2, type: 'highlight', cfi: "epubcfi(/6/8!/4/6,/1:0,/1:13)", color: 'yellow', note: 'this is' },
            { id: 3, type: 'underline', cfi: "epubcfi(/6/8!/4/6,/1:76,/1:84)", color: 'red', note: 'this is' },
            // { type: 'highlight', cfi" , spine_index: 0, style: { which: 'blue' }, notes: 'this is a note' },
            // { type: 'highlight', cfi" , spine_index: 0, style: { which: 'red' }, notes: 'this is a note' },
        ]
        if (bookmarks) {
            for (const bookmark of bookmarks) {
                const { cfi, type, color, note } = bookmark
                const annotation = { 
                    id: bookmark.id,
                    value: cfi,
                    type,
                    color,
                    note
                }
                const spineCode = (cfi.split('/')[2].split('!')[0] - 2) / 2

                const list = this.annotations.get(spineCode)
                if (list) list.push(annotation)
                else this.annotations.set(spineCode, [annotation])

                this.annotationsByCFI.set(cfi, annotation)
            }



            this.view.addEventListener('create-overlay', e => {

                const { index } = e.detail
                const list = this.annotations.get(index)
                if (list) for (const annotation of list)
                    this.view.addAnnotation(annotation)
            })

            this.view.addEventListener('draw-annotation', e => {
                const { draw, annotation } = e.detail
                const { color, type } = annotation
                console.log(annotation);


                if (type === 'highlight') draw(Overlayer.highlight, { color })
                else if (type === 'underline') draw(Overlayer.underline, { color })
            })

            this.view.addEventListener('show-annotation', e => {
                console.log(e.detail);
                const annotation = this.annotationsByCFI.get(e.detail.value)
                console.log(annotation);
            })
        }
    }
    #onLoad({ detail: { doc, index } }) {
        setSelectionHandler(this.view, doc, index)
    }

    #onRelocate({ detail }) {
        console.log(detail)
        const { cfi, fraction, location, tocItem, pageItem } = detail
        const loc = pageItem
            ? `Page ${pageItem.label}`
            : `Loc ${location.current}`
        globalThis.currentInfo = { cfi, fraction, loc, tocItem, pageItem }
    }
}

const open = async (file, cfi) => {
    const reader = new Reader()
    globalThis.reader = reader
    await reader.open(file, cfi)
}

const url = './jieyou.epub'
const cfi = "epubcfi(/6/6!/4/22,/1:0,/1:42)"
// const cfi = null
if (url) fetch(url)
    .then(res => res.blob())
    .then(blob => open(new File([blob], new URL(url, window.location.origin).pathname), cfi))
    .catch(e => console.error(e))


const getCurrentInfo = () => {
    chatpterTitle = currentInfo.tocItem?.label
    chapterTotalPages = 0
    chapterCurrentPage = 0
    bookTotalPages = currentInfo.pageItem?.total
    bookCurrentPage = currentInfo.pageItem.current
    cfi = currentInfo.cfi
    percent = currentInfo.fraction

    console.log({
        chatpterTitle,
        chapterTotalPages,
        chapterCurrentPage,
        bookTotalPages,
        bookCurrentPage,
        cfi,
        percent
    })

}

const getToc = () => {
    reader.view.book.toc
}

const goToHref = href => {
    reader.view.goTo(href)
}

const goToPercent = percent => {
    reader.view.goToFraction(percent)
}

window.next = () => {
    reader.view.next()
}

const prev = () => {
    reader.view.prev()
}

const setScroll = (scroll) => {
    reader.view.renderer.setAttribute('flow', scroll ? 'scrolled' : 'paginated')
}

let style = {
    fontSize: 1.2,
    spacing: '1.5',
    fontColor: '#66ccff',
    backgroundColor: '#000000',
    topMargin: 100,
    bottomMargin: 100,
    sideMargin: 5,
    justify: true,
    hyphenate: true,
    scroll: false
}

window.setStyle = () => {

    reader.view.renderer.setAttribute('flow', style.scroll ? 'scrolled' : 'paginated')
    reader.view.renderer.setAttribute('top-margin', `${style.topMargin}px`)
    reader.view.renderer.setAttribute('bottom-margin', `${style.bottomMargin}px`)
    reader.view.renderer.setAttribute('gap', `${style.sideMargin}%`)
    const newStyle = {
        fontSize: style.fontSize,
        spacing: style.spacing,
        fontColor: style.fontColor,
        backgroundColor: style.backgroundColor,
        justify: style.justify,
        hyphenate: style.hyphenate
    }
    reader.view.renderer.setStyles?.(getCSS(newStyle))
}

