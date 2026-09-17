export const THEME_KEY = "formflare-theme";

/** Runs before paint so a saved dark choice does not flash light. Default is light. */
export const THEME_BOOTSTRAP = `try{var r=document.documentElement;if(localStorage.getItem("${THEME_KEY}")==="dark"){r.classList.add("dark");r.classList.remove("light")}else{r.classList.add("light");r.classList.remove("dark")}}catch(e){}`;
