// zen-ui exposes its two stylesheets as side-effect subpath imports. The Vite
// aliases resolve them to real .css files, but tsc only sees the specifiers,
// and the tsconfig path maps the bare package entry alone. zen-ui ships a
// declaration for /styles inside its dist, which is outside this program, so
// both are declared here.
declare module "@algorisys/zen-ui-react/styles";
declare module "@algorisys/zen-ui-react/preflight";
