export default defineNuxtConfig({
    //! Comment if "Take Over Mode" is disabled or you dont have the Volar plugin extension
    typescript: {
        strict: true,
        typeCheck: true,

        shim: false
    },
    css: ["~/styles.css"],
    ignorePrefix: "src/"
})