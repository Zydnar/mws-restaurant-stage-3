/**
 * Creates toast-message HTML
 *
 * @param {String} text - messege body
 * @param {String} type - type of message eg. error
 * @return {string}
 */
export const toast = (text, type)=> {
    const toast = document.createElement('div');
    const ID = `toast${String(Math.random()).split('.')[1]}`;
    toast.className = `toast-message ${type}`;
    toast.innerHTML = `<div id="${ID}" aria-label="You're offline" aria-live="assertive">${text}</div>`;
    document.body.append(toast);
    const thisToast = document.getElementById(ID);
    setTimeout(()=>{
        thisToast.parentElement.remove();
    }, 5000);
};
