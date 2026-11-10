// Kept outside #main: room polling must not interrupt a film or lose its controls.
const films={
 train:{title:'The night train',description:'A steam train travels through misty countryside at night, its carriage windows glowing warmly.'},
 'pocket-watch':{title:'The pocket watch',description:'A brass pocket watch rests on a wooden table, its exposed gears turning in warm light.'},
 corridor:{title:'The empty corridor',description:'An empty, lamplit train corridor passes rain-streaked windows as the landscape moves outside.'},
};
const dialog=document.getElementById('film-dialog'),video=document.getElementById('case-film-video'),status=document.getElementById('film-status');
let trigger=null,playVersion=0;
function playFilm(id){
 const film=films[id];if(!film)return;
 const version=++playVersion;
 video.pause();video.muted=true;
 document.getElementById('film-title').textContent=film.title;
 document.getElementById('film-description').textContent=film.description;
 for(const button of dialog.querySelectorAll('[data-film-choice]'))button.setAttribute('aria-pressed',String(button.dataset.filmChoice===id));
 status.textContent='';video.poster=`/assets/films/${id}.webp`;
 video.src=`/assets/films/${id}.mp4`;
 // This call follows a click, never rendering, polling or preference detection.
 const playing=video.play();
 playing?.catch(()=>{if(version===playVersion&&dialog.open&&!video.error)status.textContent='Use the video play control to start the film.';});
}
function releaseFilm(){
 ++playVersion;video.pause();video.removeAttribute('src');video.load();status.textContent='';
 const target=trigger?.isConnected?trigger:document.getElementById('case-film-open');
 (target||document.getElementById('main'))?.focus({preventScroll:true});trigger=null;
}
document.addEventListener('click',event=>{
 const open=event.target.closest('[data-film-open]');
 if(open&&films[open.dataset.filmOpen]){trigger=open;dialog.showModal();playFilm(open.dataset.filmOpen);return;}
 const choice=event.target.closest('[data-film-choice]');
 if(choice&&dialog.open)playFilm(choice.dataset.filmChoice);
});
document.getElementById('film-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',releaseFilm);
video.addEventListener('error',()=>{if(dialog.open&&video.hasAttribute('src'))status.textContent='The film could not be loaded. You can close this viewer and keep investigating.';});
document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();});
