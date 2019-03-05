const fs = require('fs');
const path = require('path');
const promisify = require('util').promisify;
const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);
const handlebars = require('handlebars');

const tplPath = path.join(__dirname, '../template/dr.tpl')
// 用同步是因为后面的任务都以来与这个
// 只执行一次，之后使用缓存
// 声明编码后读出来的不是buffer
const source = fs.readFileSync(tplPath, 'utf-8');
const template = handlebars.compile(source)
const mime = require('./mime');
const compress = require('./compress')
const range = require('./range')
const isFresh = require('./cache')

module.exports = async function(req, res, filePath, config){
    try {
        const stats = await stat(filePath);
        if (stats.isFile()) {
            const contentType = mime(filePath);
            res.setHeader('Content-Type', contentType);

            if (isFresh(stats, req, res)) {
                res.statusCode = 304;
                res.end();
                return;
            }

            let rs;
            const {code, start, end} = range(stats.size, req, res);
            if (code == 200) {
                res.statusCode = 200;
                rs = fs.createReadStream(filePath);
            } else {
                res.statusCode = 206;
                rs = fs.createReadStream(filePath, {start, end})
            }
            if (filePath.match(config.compress)) {
                rs = compress(rs, req, res);
            }
            rs.pipe(res);
        } else if (stats.isDirectory()) {
            const files = await readdir(filePath);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            const dir = path.relative(config.root, filePath)
            const data = {
                title: path.basename(filePath),
                dir: dir ? `/${dir}` : '',
                files
            }
            res.end(template(data));
        }
    } catch (ex) {
        console.error(ex)
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain');
        res.end(`${filePath} is not a directory or file`)
    }
}
