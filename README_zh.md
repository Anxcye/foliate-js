# foliate-js

在浏览器中渲染电子书的库。

## 特性：
- 支持 EPUB、MOBI、KF8（AZW3）、FB2、CBZ、PDF（实验性；需要 PDF.js）或通过实现书籍接口自行添加对其他格式的支持
- 纯 JavaScript
- 小巧且模块化
- 无依赖
- 不依赖或包含任何解压缩库；请自带 Zip 库
- 不需要将整个文件加载到内存中
- 不关心旧版浏览器

## 演示
仓库中包含一个演示查看器，可以用来打开本地文件。要使用它，请用服务器提供文件，并导航到 reader.html。或者访问托管在 GitHub 上的在线演示。注意，它目前非常不完整，缺少许多基本功能，如键盘快捷键。

另外，使用 IDPF 算法去混淆字体需要一个 SHA-1 函数。默认情况下它使用 Web Crypto，这仅在安全上下文中可用。没有 HTTPS，你需要修改 reader.js 并传递你自己的 SHA-1 实现。

## 当前状态
它远未完成或稳定，尽管它应该与 Epub.js 几乎具有相同的功能。然而，它不支持连续滚动。

其他方面，固定布局渲染器目前尤其未完成。

## 文档
概述
这个项目使用原生 ES 模块。没有构建步骤，你可以直接导入它们。

主要有两种类型的模块：
1. 解析和加载书籍的模块，实现“书籍”接口
   - comic-book.js，用于漫画书存档（CBZ）
   - epub.js 和 epubcfi.js，用于 EPUB
   - fb2.js，用于 FictionBook 2
   - mobi.js，用于 Mobipocket 文件和 KF8（通常称为 AZW3）文件

2. 处理分页的模块，实现“渲染器”接口
   - fixed-layout.js，用于固定布局书籍
   - paginator.js，用于可重排书籍

3. 用于添加额外功能的辅助模块
   - overlayer.js，用于渲染注释
   - progress.js，用于获取阅读进度
   - search.js，用于搜索

这些模块被设计为模块化。通常，它们不直接依赖彼此。相反，它们依赖于下面详细说明的某些接口。例外是 view.js。它是更高层次的渲染器，将大部分内容串联在一起，你可以将其视为库的主入口点。见下面的“基本用法”。

仓库还包括一个更高级别的阅读器，尽管严格来说，reader.html（以及 reader.js 及其在 ui/ 和 vendor/ 中的相关文件）不被认为是库本身的一部分。它类似于 Epub.js 阅读器。你被期望修改它或用你自己的代码替换它。

## 基本用法
```js
import './view.js'

const view = document.createElement('foliate-view')
document.body.append(view)

view.addEventListener('relocate', e => {
    console.log('location changed')
    console.log(e.detail)
})

const book = / 实现了“书籍”接口的对象 /
await view.open(book)
await view.goTo(/ 路径、节索引或 CFI /)
```

## 安全
不支持脚本，因为由于内容是从同一来源（使用 blob: URLs）提供的，目前无法安全地这样做。

此外，虽然渲染器在 iframe 上使用 sandbox 属性，但由于 WebKit 错误，它是无用的：https://bugs.webkit.org/show_bug.cgi?id=218086。

因此，你必须使用内容安全策略（CSP）来阻止所有脚本，除了 'self'。可以在 https://github.com/johnfactotum/epub-test 找到用于测试的 EPUB 文件。

**[警告]**
除非你完全信任你正在渲染的内容，或者可以通过其他方式阻止脚本，否则不要在没有 CSP 的情况下使用此库。

## 书籍的主要接口

EPUB 中的线性属性）。-

页面列表。

- Readium 的 webpub 清单。

- EPUB 中的表现属性。如果

几乎所有的属性和方法都是可选的。至少需要 .sections 和 .load() 方法来加载节，否则将没有内容可渲染。

## 归档文件
读取基于 Zip 的格式将需要适应外部库。epub.js 和 comic-book.js 期望一个实现以下接口的加载对象：

.entries: （仅由 comic-book.js 使用）一个数组，每个元素都有一个 filename 属性，这是一个包含文件名（完整路径）的字符串。

.loadText(filename): 给定路径，返回文件内容作为字符串。可能是异步的。

.loadBlob(filename): 给定路径，返回文件作为 Blob 对象。可能是异步的。

.getSize(filename): 返回文件大小（以字节为单位）。用于设置 .sections 的 .size 属性（见上文）。

在演示中，这是使用 zip.js 实现的，强烈推荐使用它，因为它似乎是唯一支持文件对象（以及 HTTP 范围请求）的随机访问的库。

拥有这样的接口的一个优点是，你可以很容易地使用它来读取未归档的文件。例如，演示中有一个加载器，允许你将未打包的 EPUB 作为目录打开。

## Mobipocket 和 Kindle 文件
它可以从文件（或 Blob）对象读取 MOBI 和 KF8（.azw3 和组合 .mobi 文件）。对于 MOBI 文件，它一次性解压缩所有文本，并在每个 \u003cmbp:pagebreak\u003e 处将原始标记分割成节，而不是输出整个书的长页面，这大大提高了渲染性能。对于 KF8 文件，它在加载节时尝试解压缩尽可能少的文本，但由于当前 HUFF/CDIC 解压缩器实现的缓慢，它仍然可能相当慢。在所有情况下，图像和其他资源直到需要时才会加载。

请注意，KF8 文件可能包含 zlib 压缩的字体。它们需要使用外部库进行解压缩。演示中使用了 fflate 来解压缩它们。

## PDF 和其他固定布局格式
有一个概念验证，高度实验性的 PDF.js 适配器，你可以使用相同的固定布局渲染器来显示 PDF。

CBZ 类似地像固定布局 EPUB 一样处理。

## 渲染器
它有两个渲染器，一个用于分页可重排书籍，一个用于固定布局。它们是自定义元素（Web 组件）。

渲染器的接口目前主要是：
- .open(book): 打开一个书籍对象。
- .goTo({ index, anchor }): 导航到目的地。参数与书籍对象中的 .resolveHref() 返回的类型相同。
- .prev(): 前一页。
- .next(): 下一页。

Epub.js: 它使用 CSS 多列。因此它共享了许多相同的限制（它很慢，一些 CSS 样式不按预期工作，以及其他错误）。有一些不同之处：
- 它是一个完全独立的模块。你可以用它来分页任何内容。
- 它更简单，但目前没有支持连续滚动。
- 它没有 CFI 的概念，操作在

为了简化事情，它有一个完全独立的渲染器用于固定布局书籍。因此，不支持混合布局书籍。

两个渲染器都有一个名为 filter 的部分，你可以将 CSS 过滤器应用到其中，例如反转颜色或调整亮度：
```css
foliate-view::part(filter) {
    filter: invert(1) hue-rotate(180deg);
}
```
过滤器只应用于书籍本身，不影响叠加元素，如高亮显示。

## 分页器
boolean 属性。如果存在，添加滑动过渡效果。
-

（注意：没有 JS 属性 API。你必须使用 .setAttribute()。）

它内置了页眉和页脚区域，可以通过分页器实例的 .heads 和 .feet 属性访问。这些可以用来显示运行头和阅读进度。它们只在分页模式下可用，并且每列会有一个元素。它们可以使用 ::part(head) 和 ::part(foot) 进行样式设置。例如，要为运行头添加边框：
```css
foliate-view::part(head) {
    padding-bottom: 4px;
    border-bottom: 1px solid graytext;
}
```

## EPUB CFI
解析后的 CFIs 表示为一个普通的数组或对象。基本类型称为“部分”，这是一个具有以下结构的对象：{ index, id, offset, temporal, spatial, text, side }，对应于 CFI 中的步骤 + 偏移量。

一个折叠的，非范围 CFI 表示为一个数组，其元素是数组的部分，每个部分对应于一个完整路径。也就是说，/6/4!/4 变成了
```json
[
    [
        { "index": 6 },
        { "index": 4 }
    ],
    [
        { "index": 4 }
    ]
]
```

一个范围 CFI 是一个对象 { parent, start, end }，每个属性都是与折叠 CFI 相同类型的。例如，/6/4!/2,/2,/4 表示为
```json
{
    "parent": [
        [
            { "index": 6 },
            { "index": 4 }
        ],
        [
            { "index": 2 }
        ]
    ],
    "start": [
        [
            { "index": 2 }
        ]
    ],
    "end": [
        [
            
            { "index": 4 }
        ]
    ]
}
```

解析器使用状态机而不是正则表达式，并且应该正确处理包含转义字符的断言（见测试用例）。

它有能力忽略节点，这是必要的，如果你想将你自己的节点注入到文档中而不会影响 CFIs。为此，你需要传递一个可选的过滤器函数，它类似于 TreeWalkers 的过滤器函数：
```js
const filter = node => node.nodeType !== 1 ? NodeFilter.FILTER_ACCEPT
    : node.matches('.reject') ? NodeFilter.FILTER_REJECT
    : node.matches('.skip') ? NodeFilter.FILTER_SKIP
    : NodeFilter.FILTER_ACCEPT

CFI.toRange(doc, 'epubcfi(...)', filter)
CFI.fromRange(range, filter)
```

它可以解析和字符串化空间和时间偏移量，以及文本位置断言和侧面偏差，但目前还没有支持在渲染时使用它们。

## 突出显示文本
有一个通用模块用于覆盖任意 SVG 元素，overlayer.js。它可以用来实现注释的文本突出显示。它使用的技术与 Epub.js 中的 marks-pane 相同，但它被设计为易于扩展。你可以在 draw 函数中返回任何 SVG 元素，从而可以添加自定义样式，如波浪线或甚至是自由手绘。

覆盖层默认没有事件侦听器。它只提供了一个 .hitTest(event) 方法，可以用来进行命中测试。目前它使用 Ranges 的客户端矩形，而不是 draw() 返回的元素。

一个覆盖层对象实现了以下接口，供渲染器使用：
- .element: 覆盖层的 DOM 元素。这个元素将由渲染器自动插入、调整大小和定位在页面顶部。
- .redraw(): 当需要重新绘制覆盖层时，由渲染器调用。

## 文本步行者
不是一个特别描述性的名称，但本质上，text-walker.js 是一个小型 DOM 实用程序，允许你
将 Range、Document 或 DocumentFragment 中的所有文本节点收集到字符串数组中。

对字符串执行拆分或匹配。

将这些字符串操作的结果作为 Ranges 取回。

例如，你可以将所有文本节点连接在一起，使用 Intl.Segmenter 将字符串分割成单词，并以 DOM Ranges 的形式获取结果，这样你就可以在原始文档中标记这些单词。

在 foliate-js 中，这用于搜索和 TTS。

## 搜索
它提供了一个搜索模块，实际上可以作为独立模块用于搜索任何字符串数组。它对匹配允许跨越的字符串数量没有限制。它基于 Intl.Collator 和 Intl.Segmenter，以支持忽略变音符和仅匹配整个单词。它非常慢，你可能需要逐步加载结果。

## 文字转语音 (TTS)
TTS 模块不直接处理语音输出。相反，它的方法返回 SSML 文档（作为字符串），然后你可以将它们提供给语音合成器。

支持 SSML 属性 ssml:ph 和 ssml:alphabet。不支持 PLS 和 CSS Speech。

## 离线字典
dict.js 模块可以用来加载 dictd 和 StarDict 字典。用法：
```js
import { StarDict } from './dict.js'
import { inflate } from 'your inflate implementation'

const { ifo, dz, idx, syn } = { / 文件（或 Blob）对象 / }
const dict = new StarDict()
await dict.loadIfo(ifo)
await dict.loadDict(dz, inflate)
await dict.loadIdx(idx)
await dict.loadSyn(syn)

// 查找单词
const query = '...'
await dictionary.lookup(query)
await dictionary.synonyms(query)
```

请注意，你必须提供自己的 inflate 函数。这里是一个使用 fflate 的示例：
```js
const inflate = data => new Promise(resolve => {
    const inflate = new fflate.Inflate()
    inflate.ondata = data => resolve(data)
    inflate.push(data)
})
```

## OPDS
opds.js 模块可以用来实现 OPDS 客户端。它可以将 OPDS 1.x 文档转换为 OPDS 2.0：

getFeed(doc): 将 OPDS 1.x 源转换为 OPDS 2.0。参数必须是 DOM Document 对象。如果你有一个字符串，你需要先使用 DOMParser 获得一个 Document。

getPublication(entry): 将 OPDS 1.x 收购源中的条目转换为 OPDS 2.0 出版物。参数必须是 DOM Element 对象。

它导出了以下符号，用于 OPDS 2.0 不支持的属性：
- SYMBOL.SUMMARY: 在导航链接上使用，表示摘要/内容（见 https://github.com/opds-community/drafts/issues/51）
- SYMBOL.CONTENT: 在出版物上使用，表示内容/描述及其类型。这主要是为了保留 XHTML 的类型信息。该属性的值是一个对象，其属性为：
  - .type: 要么是 "text"，要么是 "html"，要么是 "xhtml"
  - .value: 内容的值

还有两个函数可以用来实现搜索表单：

getOpenSearch(doc): 用于 OpenSearch。参数是 OpenSearch 搜索文档的 DOM Document 对象。

getSearch(link) 用于 OPDS 2.0 中的模板搜索。参数必须是 OPDS 2.0 Link 对象。请注意，这个函数将导入 uri-template.js。

## 支持的浏览器
该库的主要使用场景是在 Foliate 中，它使用 WebKitGTK。因此，它是唯一经过广泛测试的引擎。但它也应该在 Chromium 和 Firefox 中工作。

## 许可
MIT。

## 演示用的第三方库：
- zip.js 在 BSD-3-Clause 许可下授权。
- fflate 根据 MIT 许可授权。
- PDF.js 根据 Apache 许可授权。
