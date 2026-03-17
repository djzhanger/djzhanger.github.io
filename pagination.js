'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const PAGE_HEIGHT_MM  = 297;
const PADDING_MM      = 15;
const CONTENT_H_MM    = PAGE_HEIGHT_MM - 2 * PADDING_MM; // 267 mm
const SECTION_MARGIN_PX = 20;
const PROJECT_MARGIN_PX = 20;
const TOLERANCE       = 0.98;

// ── 1. Accurate mm → px conversion ─────────────────────────────────────────
function getMmToPx() {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:1mm;visibility:hidden;';
    document.body.appendChild(el);
    const px = el.getBoundingClientRect().width;
    document.body.removeChild(el);
    return px;
}

// ── 2. Build atoms from sections ────────────────────────────────────────────
function buildAtoms(resumeEl) {
    const atoms = [];
    const sections = resumeEl.querySelectorAll(':scope > .section');

    sections.forEach(section => {
        const projectDivs = section.querySelectorAll(':scope > .project');
        const workDivs = section.querySelectorAll(':scope > .work');

        if (projectDivs.length > 0) {
            // Split: heading + first project bundled, remaining projects standalone
            const heading = section.querySelector(':scope > hf2');

            atoms.push({
                type: 'project-group',
                heading: heading,
                projectNode: projectDivs[0],
                trailingMargin: PROJECT_MARGIN_PX
            });

            for (let i = 1; i < projectDivs.length; i++) {
                atoms.push({
                    type: 'project',
                    projectNode: projectDivs[i],
                    trailingMargin: PROJECT_MARGIN_PX
                });
            }
        } else if (workDivs.length > 0) {
            // Split: heading + first work block bundled, remaining work blocks standalone
            const heading = section.querySelector(':scope > hf2');

            atoms.push({
                type: 'work-group',
                heading: heading,
                workNode: workDivs[0],
                trailingMargin: SECTION_MARGIN_PX
            });

            for (let i = 1; i < workDivs.length; i++) {
                atoms.push({
                    type: 'work',
                    workNode: workDivs[i],
                    trailingMargin: SECTION_MARGIN_PX
                });
            }
        } else {
            // Treat entire section as one indivisible atom
            atoms.push({
                type: 'section',
                el: section,
                trailingMargin: SECTION_MARGIN_PX
            });
        }
    });

    return atoms;
}

// ── 3. Measure each atom ────────────────────────────────────────────────────
function measureAtoms(atoms) {
    const mc = document.createElement('div');
    mc.style.cssText = 'position:absolute;top:-99999px;left:-99999px;width:180mm;visibility:hidden;overflow:visible;';
    document.body.appendChild(mc);

    atoms.forEach(atom => {
        let clone;

        if (atom.type === 'section') {
            clone = atom.el.cloneNode(true);
        } else if (atom.type === 'project-group') {
            clone = document.createElement('div');
            if (atom.heading) clone.appendChild(atom.heading.cloneNode(true));
            clone.appendChild(atom.projectNode.cloneNode(true));
        } else if (atom.type === 'work-group') {
            clone = document.createElement('div');
            if (atom.heading) clone.appendChild(atom.heading.cloneNode(true));
            clone.appendChild(atom.workNode.cloneNode(true));
        } else if (atom.type === 'work') {
            clone = atom.workNode.cloneNode(true);
        } else {
            // 'project'
            clone = atom.projectNode.cloneNode(true);
        }

        mc.appendChild(clone);
        atom.contentHeight = clone.getBoundingClientRect().height;
        atom.totalHeight   = atom.contentHeight + atom.trailingMargin;
        mc.removeChild(clone);
    });

    document.body.removeChild(mc);
}

// ── 4. Greedy bin-pack ──────────────────────────────────────────────────────
function packAtoms(atoms, effectiveH) {
    const pages = [[]];
    const fills = [0];

    atoms.forEach(atom => {
        const last = pages.length - 1;

        if (fills[last] + atom.totalHeight <= effectiveH) {
            // Fits with trailing margin
            pages[last].push(atom);
            fills[last] += atom.totalHeight;
        } else if (fills[last] + atom.contentHeight <= effectiveH) {
            // Fits only as the last item on this page (no trailing margin counted)
            pages[last].push(atom);
            pages.push([]);
            fills.push(0);
        } else {
            // Doesn't fit → push to new page
            pages.push([atom]);
            fills.push(atom.totalHeight);
            if (atom.contentHeight > effectiveH) {
                console.warn('pagination.js: oversized atom', atom);
            }
        }
    });

    return pages.filter(p => p.length > 0);
}

// ── 5. Build page DOM elements ──────────────────────────────────────────────
function buildPages(packedPages) {
    packedPages.forEach(pageAtoms => {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';

        pageAtoms.forEach((atom, idx) => {
            const isLast = (idx === pageAtoms.length - 1);

            if (atom.type === 'section') {
                atom.el.style.marginBottom = isLast ? '0' : '';
                pageDiv.appendChild(atom.el);

            } else if (atom.type === 'project-group') {
                const wrapper = document.createElement('section');
                wrapper.className = 'section';
                wrapper.style.marginBottom = isLast ? '0' : '';

                if (atom.heading) wrapper.appendChild(atom.heading);

                atom.projectNode.style.marginBottom = isLast ? '0' : '';
                wrapper.appendChild(atom.projectNode);

                pageDiv.appendChild(wrapper);

            } else if (atom.type === 'work-group') {
                const wrapper = document.createElement('section');
                wrapper.className = 'section';
                wrapper.style.marginBottom = isLast ? '0' : '';

                if (atom.heading) wrapper.appendChild(atom.heading);

                atom.workNode.style.marginBottom = isLast ? '0' : '';
                wrapper.appendChild(atom.workNode);

                pageDiv.appendChild(wrapper);

            } else if (atom.type === 'work') {
                atom.workNode.style.marginBottom = isLast ? '0' : '';
                pageDiv.appendChild(atom.workNode);

            } else {
                // 'project'
                atom.projectNode.style.marginBottom = isLast ? '0' : '';
                pageDiv.appendChild(atom.projectNode);
            }
        });

        document.body.appendChild(pageDiv);
    });
}

// ── 6. Main entry point ─────────────────────────────────────────────────────
function paginateResume() {
    const resumeEl = document.querySelector('.resume');
    if (!resumeEl) return;

    const MM_TO_PX      = getMmToPx();
    const CONTENT_HEIGHT_PX = CONTENT_H_MM * MM_TO_PX;
    const EFFECTIVE_H   = CONTENT_HEIGHT_PX * TOLERANCE;

    const atoms = buildAtoms(resumeEl);
    measureAtoms(atoms);
    const packed = packAtoms(atoms, EFFECTIVE_H);
    buildPages(packed);

    // Remove the now-empty staging container
    resumeEl.parentNode.removeChild(resumeEl);
}

document.addEventListener('DOMContentLoaded', paginateResume);
