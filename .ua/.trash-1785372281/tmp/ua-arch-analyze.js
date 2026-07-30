#!/usr/bin/env node
'use strict';
const fs = require('fs');

function main() {
  const inPath = process.argv[2];
  const outPath = process.argv[3];
  if (!inPath || !outPath) { console.error('usage: analyze.js <in> <out>'); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const fileNodes = data.fileNodes || [];
  const importEdges = data.importEdges || [];
  const allEdges = data.allEdges || [];

  const idToNode = new Map();
  fileNodes.forEach(n => idToNode.set(n.id, n));
  const isFileNode = id => idToNode.has(id);

  // ---- common prefix of filePaths ----
  const paths = fileNodes.map(n => n.filePath || '');
  function commonPrefixDir(paths) {
    if (!paths.length) return '';
    const split = paths.map(p => p.split('/'));
    let prefix = [];
    for (let i = 0; ; i++) {
      const seg = split[0][i];
      if (seg === undefined) break;
      if (split.every(s => s[i] === seg) && split.every(s => s.length > i + 1)) prefix.push(seg);
      else break;
    }
    return prefix.length ? prefix.join('/') + '/' : '';
  }
  const prefix = commonPrefixDir(paths);

  // ---- A. directory grouping ----
  const directoryGroups = {};
  const fileToGroup = new Map();
  for (const n of fileNodes) {
    let p = n.filePath || '';
    let rest = prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p;
    const segs = rest.split('/');
    let group;
    if (segs.length > 1) group = segs[0];
    else group = '(root)';
    (directoryGroups[group] = directoryGroups[group] || []).push(n.id);
    fileToGroup.set(n.id, group);
  }

  // ---- B. node type grouping ----
  const nodeTypeGroups = {};
  for (const n of fileNodes) (nodeTypeGroups[n.type] = nodeTypeGroups[n.type] || []).push(n.id);

  // ---- C. adjacency (imports) fan-in/out ----
  const fanOut = {}, fanIn = {};
  for (const e of importEdges) {
    if (!isFileNode(e.source) || !isFileNode(e.target)) continue;
    fanOut[e.source] = (fanOut[e.source] || 0) + 1;
    fanIn[e.target] = (fanIn[e.target] || 0) + 1;
  }

  // ---- D. cross-category edges (by node type) ----
  const crossMap = {};
  for (const e of allEdges) {
    const s = idToNode.get(e.source), t = idToNode.get(e.target);
    if (!s || !t) continue;
    if (s.type === t.type) continue;
    const key = s.type + '|' + t.type + '|' + e.type;
    crossMap[key] = (crossMap[key] || 0) + 1;
  }
  const crossCategoryEdges = Object.entries(crossMap).map(([k, count]) => {
    const [fromType, toType, edgeType] = k.split('|');
    return { fromType, toType, edgeType, count };
  }).sort((a, b) => b.count - a.count);

  // ---- E. inter-group import frequency ----
  const interMap = {};
  for (const e of importEdges) {
    if (!isFileNode(e.source) || !isFileNode(e.target)) continue;
    const g1 = fileToGroup.get(e.source), g2 = fileToGroup.get(e.target);
    if (g1 === g2) continue;
    const key = g1 + '|' + g2;
    interMap[key] = (interMap[key] || 0) + 1;
  }
  const interGroupImports = Object.entries(interMap).map(([k, count]) => {
    const [from, to] = k.split('|'); return { from, to, count };
  }).sort((a, b) => b.count - a.count);

  // ---- F. intra-group density ----
  const intraGroupDensity = {};
  const groupTotalEdges = {}, groupInternalEdges = {};
  for (const e of importEdges) {
    if (!isFileNode(e.source) || !isFileNode(e.target)) continue;
    const g1 = fileToGroup.get(e.source), g2 = fileToGroup.get(e.target);
    if (g1 === g2) { groupInternalEdges[g1] = (groupInternalEdges[g1] || 0) + 1; groupTotalEdges[g1] = (groupTotalEdges[g1] || 0) + 1; }
    else { groupTotalEdges[g1] = (groupTotalEdges[g1] || 0) + 1; groupTotalEdges[g2] = (groupTotalEdges[g2] || 0) + 1; }
  }
  for (const g of Object.keys(directoryGroups)) {
    const internal = groupInternalEdges[g] || 0;
    const total = groupTotalEdges[g] || 0;
    intraGroupDensity[g] = { internalEdges: internal, totalEdges: total, density: total ? +(internal / total).toFixed(3) : 0 };
  }

  // ---- G. directory pattern matching ----
  const dirPatterns = [
    [/^(routes|api|controllers|endpoints|handlers|controller|routers|blueprints|serializers)$/, 'api'],
    [/^(services|core|lib|domain|logic|signals|composables|mailers|jobs|channels|internal)$/, 'service'],
    [/^(models|db|data|persistence|repository|entities|entity|migrations|sql|database)$/, 'data'],
    [/^(components|views|pages|ui|layouts|screens)$/, 'ui'],
    [/^(middleware|plugins|interceptors|guards)$/, 'middleware'],
    [/^(utils|helpers|common|shared|tools|templatetags|pkg)$/, 'utility'],
    [/^(config|constants|env|settings|management|commands)$/, 'config'],
    [/^(__tests__|test|tests|spec|specs)$/, 'test'],
    [/^(types|interfaces|schemas|contracts|dtos|dto|request|response)$/, 'types'],
    [/^hooks$/, 'hooks'],
    [/^(store|state|reducers|actions|slices)$/, 'state'],
    [/^(assets|static|public)$/, 'assets'],
    [/^(cmd|bin)$/, 'entry'],
    [/^(docs|documentation|wiki)$/, 'documentation'],
    [/^(deploy|deployment|infra|infrastructure|k8s|kubernetes|helm|charts|terraform|tf|docker)$/, 'infrastructure'],
    [/^(\.github|\.gitlab|\.circleci)$/, 'ci-cd'],
  ];
  const patternMatches = {};
  for (const g of Object.keys(directoryGroups)) {
    let label = null;
    for (const [re, l] of dirPatterns) if (re.test(g)) { label = l; break; }
    if (label) patternMatches[g] = label;
  }

  // ---- H. deployment topology ----
  const allPaths = fileNodes.map(n => n.filePath || '');
  const infraFiles = [];
  let hasDockerfile = false, hasCompose = false, hasK8s = false, hasTerraform = false, hasCI = false;
  for (const p of allPaths) {
    const base = p.split('/').pop();
    if (/^Dockerfile/.test(base)) { hasDockerfile = true; infraFiles.push(p); }
    if (/^docker-compose/.test(base)) { hasCompose = true; infraFiles.push(p); }
    if (/\.(tf|tfvars)$/.test(base)) { hasTerraform = true; infraFiles.push(p); }
    if (/\.github\/workflows\//.test(p) || /\.gitlab-ci\.yml$/.test(base) || /^Jenkinsfile$/.test(base)) { hasCI = true; infraFiles.push(p); }
    if (/(k8s|kubernetes|helm)/.test(p)) { hasK8s = true; }
  }

  // ---- I. data pipeline ----
  const schemaFiles = [], migrationFiles = [], dataModelFiles = [], apiHandlerFiles = [];
  for (const n of fileNodes) {
    const p = n.filePath || '';
    if (/\.(graphql|gql|proto|prisma)$/.test(p)) schemaFiles.push(p);
    if (/migrations?\//.test(p) || /\.sql$/.test(p)) migrationFiles.push(p);
    if (/(models?|entities)\//.test(p)) dataModelFiles.push(p);
    if (/(routes|api|controllers|handlers)\//.test(p)) apiHandlerFiles.push(p);
  }

  // ---- J. doc coverage ----
  const docPaths = fileNodes.filter(n => /\.(md|rst)$/i.test(n.filePath || '')).map(n => n.filePath);
  const groupsWithDocs = new Set();
  for (const g of Object.keys(directoryGroups)) {
    for (const id of directoryGroups[g]) {
      const p = idToNode.get(id).filePath || '';
      if (/\.(md|rst)$/i.test(p)) groupsWithDocs.add(g);
    }
  }
  const totalGroups = Object.keys(directoryGroups).length;
  const undocumentedGroups = Object.keys(directoryGroups).filter(g => !groupsWithDocs.has(g));

  // ---- K. dependency direction ----
  const pairDir = {};
  for (const { from, to, count } of interGroupImports) {
    const key = [from, to].sort().join('||');
    pairDir[key] = pairDir[key] || {};
    pairDir[key][from + '->' + to] = count;
  }
  const dependencyDirection = [];
  const seen = new Set();
  for (const { from, to } of interGroupImports) {
    const key = [from, to].sort().join('||');
    if (seen.has(key)) continue; seen.add(key);
    const ab = interMap[from + '|' + to] || 0;
    const ba = interMap[to + '|' + from] || 0;
    if (ab >= ba) dependencyDirection.push({ dependent: from, dependsOn: to });
    else dependencyDirection.push({ dependent: to, dependsOn: from });
  }

  // ---- stats ----
  const filesPerGroup = {};
  for (const g of Object.keys(directoryGroups)) filesPerGroup[g] = directoryGroups[g].length;
  const nodeTypeCounts = {};
  for (const t of Object.keys(nodeTypeGroups)) nodeTypeCounts[t] = nodeTypeGroups[t].length;

  const result = {
    scriptCompleted: true,
    commonPrefix: prefix,
    directoryGroups,
    nodeTypeGroups,
    crossCategoryEdges,
    interGroupImports,
    intraGroupDensity,
    patternMatches,
    deploymentTopology: { hasDockerfile, hasCompose, hasK8s, hasTerraform, hasCI, infraFiles: [...new Set(infraFiles)] },
    dataPipeline: { schemaFiles, migrationFiles: migrationFiles.slice(0, 50), dataModelFiles, apiHandlerFiles },
    docCoverage: { groupsWithDocs: groupsWithDocs.size, totalGroups, coverageRatio: totalGroups ? +(groupsWithDocs.size / totalGroups).toFixed(2) : 0, undocumentedGroups },
    dependencyDirection,
    fileStats: { totalFileNodes: fileNodes.length, filesPerGroup, nodeTypeCounts },
    fileFanIn: fanIn,
    fileFanOut: fanOut,
  };
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log('done ->', outPath);
}

try { main(); } catch (e) { console.error(e.stack || e.message); process.exit(1); }
