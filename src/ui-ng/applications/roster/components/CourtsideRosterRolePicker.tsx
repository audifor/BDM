import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { LINEUP_SLOTS, type LineupSlot } from '@/domain/tactics'

/** Courtside role menu, not an OS select. Outside click/Escape never changes a lineup. */
export function CourtsideRosterRolePicker({name,slot,disabled,onAssign,onClear}:{
  readonly name:string
  readonly slot?:LineupSlot
  readonly disabled:boolean
  readonly onAssign:(slot:LineupSlot)=>void
  readonly onClear:()=>void
}) {
  const [open,setOpen]=useState(false)
  const [coords,setCoords]=useState({top:0,left:0})
  const trigger=useRef<HTMLButtonElement>(null)
  const menu=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!open)return
    const outside=(event:PointerEvent)=>{
      if(!trigger.current?.contains(event.target as Node)&&!menu.current?.contains(event.target as Node))setOpen(false)
    }
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus()}}
    document.addEventListener('pointerdown',outside)
    document.addEventListener('keydown',escape)
    return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
  },[open])
  const show=()=>{
    if(disabled)return
    const rect=trigger.current!.getBoundingClientRect()
    setCoords({
      top:Math.max(8,rect.bottom+278>window.innerHeight?rect.top-276:rect.bottom+5),
      left:Math.min(Math.max(8,rect.left),window.innerWidth-215),
    })
    setOpen(value=>!value)
  }
  const choose=(value:LineupSlot|undefined)=>{
    if(value===undefined)onClear();else onAssign(value)
    setOpen(false)
    trigger.current?.focus()
  }
  const label=slot===undefined?'Sin rol':['PG','SG','SF','PF','C'].includes(slot)?'Titular · '+slot:'Banquillo · '+slot
  return <>
    <button ref={trigger} type="button" className={'courtside-role-picker'+(slot?' is-assigned':'')}
      aria-haspopup="menu" aria-expanded={open} aria-label={'Rotación '+name}
      title={disabled?'Solo el equipo gestionado y los jugadores de su plantilla pueden editar su rotación':'Editar rol de rotación'}
      disabled={disabled} onClick={event=>{event.stopPropagation();show()}}>
      <span>{label}</span><span aria-hidden="true" className="courtside-role-picker__chevron">⌄</span>
    </button>
    {open&&createPortal(<div ref={menu} role="menu" aria-label={'Asignación de '+name}
      className="courtside-role-picker__menu" style={{top:coords.top,left:coords.left}}
      onClick={e=>e.stopPropagation()}>
      <div className="courtside-role-picker__menu-title">ROTACIÓN · {name}</div>
      <button type="button" role="menuitemradio" aria-checked={slot===undefined}
        className={slot===undefined?'is-active':''} onClick={()=>choose(undefined)}>SIN ASIGNAR</button>
      <div className="courtside-role-picker__menu-label">QUINTETO INICIAL</div>
      {LINEUP_SLOTS.filter(x=>['PG','SG','SF','PF','C'].includes(x)).map(item=>
        <button type="button" key={item} role="menuitemradio" aria-checked={slot===item}
          className={slot===item?'is-active':''} onClick={()=>choose(item)}>TITULAR {item}</button>)}
      <div className="courtside-role-picker__menu-label">BANQUILLO</div>
      {LINEUP_SLOTS.filter(x=>!['PG','SG','SF','PF','C'].includes(x)).map(item=>
        <button type="button" key={item} role="menuitemradio" aria-checked={slot===item}
          className={slot===item?'is-active':''} onClick={()=>choose(item)}>BANQUILLO {item}</button>)}
    </div>,trigger.current?.closest('.courtside-roster-screen')??document.body)}
  </>
}
