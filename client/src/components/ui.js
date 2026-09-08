import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { BAND_LABEL, bandClass, initials } from '../lib/format.ts';
import { useToasts } from '../lib/store.tsx';
export function Avatar({ src, name, size = 'md', }) {
    const cls = `avatar${size === 'lg' ? ' lg' : size === 'sm' ? ' sm' : ''}`;
    if (src)
        return _jsx("img", { className: cls, src: src, alt: "", loading: "lazy" });
    return (_jsx("div", { className: `${cls} fallback`, "aria-hidden": "true", children: initials(name) }));
}
export function BandDot({ band }) {
    return _jsx("span", { className: `band-dot ${bandClass(band)}`, title: BAND_LABEL[band ?? 'frozen'] });
}
export function BandLabel({ band }) {
    return _jsx("span", { className: `band-label ${bandClass(band)}`, children: BAND_LABEL[band ?? 'frozen'] });
}
export function Spinner() {
    return _jsx("span", { className: "spinner", role: "status", "aria-label": "Loading" });
}
export function Modal({ title, subtitle, onClose, children, wide, }) {
    useEffect(() => {
        if (!onClose)
            return;
        const onKey = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (_jsx("div", { className: "overlay", onMouseDown: (e) => {
            if (e.target === e.currentTarget)
                onClose?.();
        }, children: _jsxs("div", { className: `modal${wide ? ' wide' : ''}`, role: "dialog", "aria-modal": "true", "aria-label": title, children: [_jsx("h2", { children: title }), subtitle && _jsx("p", { className: "sub", children: subtitle }), children] }) }));
}
export function Toasts() {
    const toasts = useToasts();
    if (!toasts.length)
        return null;
    return (_jsx("div", { className: "toasts", "aria-live": "polite", children: toasts.map((t) => (_jsx("div", { className: `toast ${t.kind}`, children: t.text }, t.id))) }));
}
export function StatTile({ label, value }) {
    return (_jsxs("div", { className: "stat-tile", children: [_jsx("div", { className: "k", children: label }), _jsx("div", { className: "v", children: value })] }));
}
export function Empty({ children }) {
    return _jsx("div", { className: "board empty", children: children });
}
export function DriftMark() {
    return (_jsxs("svg", { className: "mark", viewBox: "0 0 64 64", width: "24", height: "24", "aria-hidden": "true", children: [_jsx("defs", { children: _jsxs("linearGradient", { id: "dm", x1: "0", y1: "0", x2: "1", y2: "1", children: [_jsx("stop", { offset: "0", stopColor: "#f97316" }), _jsx("stop", { offset: "0.55", stopColor: "#ef4444" }), _jsx("stop", { offset: "1", stopColor: "#a855f7" })] }) }), _jsx("circle", { cx: "26", cy: "32", r: "19", fill: "none", stroke: "#1e2637", strokeWidth: "3" }), _jsx("circle", { cx: "28", cy: "32", r: "12.5", fill: "none", stroke: "#334155", strokeWidth: "3" }), _jsx("circle", { cx: "30", cy: "32", r: "6.5", fill: "none", stroke: "url(#dm)", strokeWidth: "3.5" }), _jsx("path", { d: "M44 32h11", stroke: "url(#dm)", strokeWidth: "4", strokeLinecap: "round" }), _jsx("path", { d: "M49 26.5 55.5 32 49 37.5", fill: "none", stroke: "url(#dm)", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" })] }));
}
