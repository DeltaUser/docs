import pkg from 'fetch';
const { fetchUrl : request } = pkg;
import cors from 'cors';
import bodyParser from 'body-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import useragent from 'express-useragent';
const app = express();
const github = 'DeltaUser/lgm';
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10
});

app.set('trust proxy', 1);
app.use(limiter);
app.use(useragent.express());
app.use(cors());
app.use(bodyParser.json());

async function sendRequest(url, json, options={}) {
    return new Promise(async (resolve) => {
        await request(url, options, (error, meta, body) => {
            if(json) return resolve(JSON.parse(body.toString()));
            resolve({error, meta, body: body.toString()});
        });
    });
}

async function getTree(owner, name) {
    const { data: { repository: { defaultBranchRef: { target: { history: { nodes: { [0]: { tree: { entries: GRAPHQL_TREE } } } } } } } } } = await sendRequest('https://api.github.com/graphql', true, {
        "method": "POST",
        "payload": JSON.stringify({
            "query": `query{repository(owner: "${owner}", name: "${name}") {defaultBranchRef { target {... on Commit {history(first: 1 until:"${new Date().toISOString()}") {nodes {tree {entries {name object {... on Blob {byteSize text} ... on Tree {entries {name object{... on Blob {byteSize text} ...on Tree{entries{name object{... on Blob {byteSize text} ...on Tree{entries{name}}}}}}}}}}}}}}}}}}`
        }),
        "headers": {
            "Authorization": `token ${process.env.GITHUBTOKEN}`
        }
    });
    return GRAPHQL_TREE;
}

function getFilesOnly(TREE) {
    function getFiles(files, path="") {
        const FILES = [];
        for (const FILE_SLASH_FOLDER of files) {
            if(FILE_SLASH_FOLDER.object.entries) {
                if(FILE_SLASH_FOLDER.name.startsWith('.')) continue;
                FILES.push(...getFiles(FILE_SLASH_FOLDER.object.entries, `${path !== "" ? "/" : ""}${FILE_SLASH_FOLDER.name}`));
            }
            else {
                if(!FILE_SLASH_FOLDER.name.includes('js') && FILE_SLASH_FOLDER.name !== 'README.md' || FILE_SLASH_FOLDER.name.includes('json')) continue;
                const CONTENT = FILE_SLASH_FOLDER.object.text;
                FILE_SLASH_FOLDER.path = path;
                FILE_SLASH_FOLDER.fullPath = `${path !== "" ? `${path}/` : ``}${FILE_SLASH_FOLDER.name}`;
                FILE_SLASH_FOLDER.content = CONTENT;
                delete FILE_SLASH_FOLDER.object;
                FILES.push(FILE_SLASH_FOLDER);
            }
        }
        return FILES;
    }
    return getFiles(TREE);
}

function checkPathObject(PAGES, fullPATH, CONTENT, FILE, PATH) {
    if(PATH !== '') for (const path of PATH.split('/')) {
        if(!fullPATH[path]) fullPATH[path] = {};
        fullPATH = fullPATH[path];
    }
    fullPATH[FILE.name] = CONTENT;
    return PAGES;
}

async function getMDFILES(owner, name) {
    const TREE = await getTree(owner, name);
    const FILES = getFilesOnly(TREE);
    const PAGES = {
        Files: {},
        Folders: {}
    };
    if(FILES.find(e => e.name === 'README.md')) PAGES.Home = FILES.find(e => e.name === 'README.md').content;
    else PAGES.Home = `# ${github.split('/')[1]}\n\n![GitHub repo size](https://img.shields.io/github/repo-size/${owner}/${name})\n![Libraries.io dependency status for GitHub repo](https://img.shields.io/librariesio/github/${owner}/${name})\n![GitHub issues](https://img.shields.io/github/issues/${owner}/${name})\n\n# Creator\nThe creator of this repository is *[${github.split('/')[0]}](https://github.com/${github.split('/')[0]})*.`;

    for (const FILE of FILES) {
        let MDCONTENT = `# ${FILE.name}`;
        const settings = {};

        if(FILE.content.startsWith('/**')) {
            for (const f of FILE.content.split('/**')[1].split('*/')[0].trim().split(' *')) {
                settings[f.split('@')[1].split(' ')[0].trim()] = f.substring(f.indexOf(" ") + 1).replace(/\\n/g, '').substring(f.substring(f.indexOf(" ") + 1).replace(/\\n/g, '').indexOf(" ") + 1);
            }
        }
        if(settings.forbidDocs) continue;
        if(settings.description) MDCONTENT += `\n${settings.description}`;
        if(Object.keys(settings).length !== 0) MDCONTENT += '\n\n# Information\nAll of this information is from the github repo directly.';
        
        for (const setting of Object.keys(settings)) {
            const value = settings[setting];
            MDCONTENT += `\n\n\`${setting.trim()}\`: *${value.trim()}*`;
        }

        const CONTENT = `File contents of *[${FILE.fullPath}](https://github.com/${owner}/${name}/blob/master/${FILE.fullPath})*.\n\`\`\`${FILE.name.split('.')[FILE.name.split('.').length - 1] === 'mjs' ? 'js' : FILE.name.split('.')[FILE.name.split('.').length - 1]}\n${FILE.content}\n\`\`\``;
        if(FILE.path !== '') checkPathObject(PAGES, PAGES.Files, CONTENT, FILE, FILE.path);
        checkPathObject(PAGES, PAGES.Folders, MDCONTENT, FILE, FILE.path);
    }
    return {
        TREE,
        FILES,
        PAGES
    }
}

(async () => {
    app.listen(process.env.PORT || 5000, () => console.log(`[API] Listening to http://localhost:${process.env.PORT || 5000}/`));
    app.get('/api/makeDocs', async (req, res) => {
        const owner = req.query.owner;
        const name = req.query.name;
        if(!owner && !name) return res.send(300);
        res.send((await getMDFILES(owner, name)).PAGES);
    });
})();