declare module '*.module.scss' {
    const classes: { [key: string]: string };
    export default classes;
}
declare module '*.css' {
    const content: { [className: string]: string };
    export default content;
}