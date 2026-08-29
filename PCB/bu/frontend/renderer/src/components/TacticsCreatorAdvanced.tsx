import { useState, useEffect, useRef } from 'react';
import {
  MousePointer2, Circle, ArrowRight, Type,
  RotateCcw, Eraser, Save, Move, X,
  Plus, Trash2, Play, Pause, SkipBack, ListChecks, AlertTriangle,
  FolderOpen, Book, BookOpen, PlusSquare, Settings, Database, CheckCircle
} from 'lucide-react';
import {
  savePlay as savePlayToDB,
  loadPlays,
  deletePlay as deletePlayFromDB,
  savePlaybook as savePlaybookToDB,
  loadPlaybooks,
  updatePlaybook as updatePlaybookDB,
  deletePlaybook as deletePlaybookFromDB,
  setActivePlaybook,
  analyzePlayFrames,
  SavedPlay as DBSavedPlay,
  Playbook as DBPlaybook,
  PlayType
} from '../lib/playbookManager';

// --- PROPS ---
interface TacticsCreatorProps {
  clubId?: number | null;
  onSaveCustomPlay?: (play: any) => void;
}

// --- TIPOS ---
type Tool = 'select' | 'move' | 'pass' | 'dribble' | 'screen' | 'defender';

interface Position { x: number; y: number; }

interface PlayerToken {
  id: number;
  x: number;
  y: number;
  label: string;
  role: string;
}

interface ActionPath {
  id: number;
  type: 'move' | 'pass' | 'dribble' | 'screen';
  points: Position[]; 
  linkedId?: number; 
}

interface FrameData {
  players: PlayerToken[];
  ballOwnerId: number | null; 
  ballPosition: Position;     
  paths: ActionPath[];
  defenders: Position[];
}

interface SavedPlay {
  id: string;
  name: string;
  date: string;
  frames: FrameData[];
  engineData: any;
}

interface Playbook {
  id: string;
  name: string;
  playIds: string[];
}

// --- TEMA VISUAL ---
const THEME = {
  bg: '#1e293b',
  courtLines: '#64748b',
  moveColor: '#ffffff',
  passColor: '#fbbf24',
  dribbleColor: '#38bdf8',
  screenColor: '#ef4444',
  defColor: '#ef4444',
};

// --- DATOS INICIALES ---
const INITIAL_PLAYERS = [
  { id: 1, label: '1', role:'PG', x: 250, y: 380 },
  { id: 2, label: '2', role:'SG', x: 80, y: 300 },
  { id: 3, label: '3', role:'SF', x: 420, y: 300 },
  { id: 4, label: '4', role:'PF', x: 160, y: 150 },
  { id: 5, label: '5', role:'C', x: 340, y: 150 },
];

export default function TacticsCreator({ clubId, onSaveCustomPlay }: TacticsCreatorProps) {
  // ESTADO
  const [playName, setPlayName] = useState("Nueva Jugada");
  const [frames, setFrames] = useState<FrameData[]>([{
    players: JSON.parse(JSON.stringify(INITIAL_PLAYERS)),
    ballOwnerId: 1,
    ballPosition: { x: 250, y: 380 },
    paths: [],
    defenders: []
  }]);

  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>('select');

  // GESTIÓN ARCHIVOS
  const [savedPlays, setSavedPlays] = useState<SavedPlay[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);

  // ESTADO DB
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [useDatabase, setUseDatabase] = useState(!!clubId); // Si hay clubId, usar DB

  // MODALES
  const [modalMode, setModalMode] = useState<'none' | 'load' | 'createPB' | 'editPB'>('none');
  const [showAddToPbDropdown, setShowAddToPbDropdown] = useState(false);
  const [newPbName, setNewPbName] = useState("");
  const [selectedPbForEdit, setSelectedPbForEdit] = useState<Playbook | null>(null);

  // INTERACCIÓN
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPathPoints, setCurrentPathPoints] = useState<Position[]>([]);
  const [drawingLinkedId, setDrawingLinkedId] = useState<number | undefined>(undefined);
  const [dragging, setDragging] = useState<{ type: 'player'|'ball'|'defender', id?: number, index?: number } | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // --- SAFE GUARD (SOLUCIÓN AL CRASH AL BORRAR) ---
  // Calculamos un índice seguro. Si currentFrameIndex apunta fuera del array (porque borramos el último), usamos el último disponible.
  const displayIndex = Math.min(currentFrameIndex, frames.length - 1);
  const currentFrame = frames[displayIndex];

  // Protección extra: Si por algún motivo no hay frame, no renderizamos nada (evita crash)
  if (!currentFrame) return null;

  // CARGAR DATOS
  useEffect(() => {
    const loadData = async () => {
      if (clubId && useDatabase) {
        // Cargar desde base de datos
        try {
          const [dbPlays, dbPlaybooks] = await Promise.all([
            loadPlays(clubId),
            loadPlaybooks(clubId)
          ]);

          // Convertir formato DB a formato local
          const localPlays: SavedPlay[] = dbPlays.map(p => ({
            id: p.id,
            name: p.name,
            date: new Date(p.createdAt).toLocaleDateString(),
            frames: p.frames,
            engineData: p.engineData
          }));

          const localPlaybooks: Playbook[] = dbPlaybooks.map(pb => ({
            id: pb.id,
            name: pb.name,
            playIds: pb.playIds
          }));

          setSavedPlays(localPlays);
          setPlaybooks(localPlaybooks);
          console.log(`✅ Cargadas ${localPlays.length} jugadas y ${localPlaybooks.length} playbooks desde DB`);
        } catch (err) {
          console.error('Error cargando desde DB:', err);
          // Fallback a localStorage
          const storedPlays = localStorage.getItem('my_playbook_plays');
          if (storedPlays) setSavedPlays(JSON.parse(storedPlays));
          const storedBooks = localStorage.getItem('my_playbooks');
          if (storedBooks) setPlaybooks(JSON.parse(storedBooks));
        }
      } else {
        // Cargar desde localStorage
        const storedPlays = localStorage.getItem('my_playbook_plays');
        if (storedPlays) setSavedPlays(JSON.parse(storedPlays));
        const storedBooks = localStorage.getItem('my_playbooks');
        if (storedBooks) setPlaybooks(JSON.parse(storedBooks));
      }
    };

    loadData();
  }, [clubId, useDatabase]);

  // --- MATEMÁTICAS ---
  const getSVGPoint = (e: React.MouseEvent | MouseEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const CTM = svgRef.current.getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };
    return { x: (e.clientX - CTM.e) / CTM.a, y: (e.clientY - CTM.f) / CTM.d };
  };
  const pointsToCurvedPath = (points: Position[]) => { if (points.length < 2) return ''; let d = `M ${points[0].x} ${points[0].y}`; for (let i = 1; i < points.length; i++) d += ` L ${points[i].x} ${points[i].y}`; return d; };
  const pointsToStraightPath = (points: Position[]) => { if (points.length < 2) return ''; const start = points[0]; const end = points[points.length - 1]; return `M ${start.x} ${start.y} L ${end.x} ${end.y}`; };
  const getZigZagOnPath = (points: Position[]) => { if (points.length < 2) return ''; let d = `M ${points[0].x} ${points[0].y}`; const amp = 5; const res = 10; let acc = 0; let last = points[0]; let side = 1; for (let i = 1; i < points.length; i++) { const p = points[i]; acc += Math.hypot(p.x - last.x, p.y - last.y); if (acc > res) { const dx = p.x - last.x; const dy = p.y - last.y; const len = Math.sqrt(dx*dx + dy*dy); if (len > 0) { d += ` L ${p.x + (-dy/len)*amp*side} ${p.y + (dx/len)*amp*side}`; last = p; acc = 0; side *= -1; } } } const end = points[points.length-1]; d += ` L ${end.x} ${end.y}`; return d; };
  const getScreenHammer = (points: Position[]) => { if (points.length < 2) return ''; const end = points[points.length - 1]; const prev = points[Math.max(0, points.length - 5)]; const ang = Math.atan2(end.y - prev.y, end.x - prev.x); const s = 12; return `M ${end.x + Math.cos(ang + Math.PI/2) * s} ${end.y + Math.sin(ang + Math.PI/2) * s} L ${end.x + Math.cos(ang - Math.PI/2) * s} ${end.y + Math.sin(ang - Math.PI/2) * s}`; };

  // --- LÓGICA ---
  const generateEngineData = () => {
    // Usar la función de análisis del playbookManager para datos más completos
    return analyzePlayFrames(frames);
  };

  const savePlay = async (): Promise<string> => {
    setIsSaving(true);
    setSaveSuccess(false);

    const engineData = generateEngineData();

    if (clubId && useDatabase) {
      // Guardar en base de datos
      try {
        const dbPlay = await savePlayToDB({
          clubId,
          name: playName,
          playType: 'custom' as PlayType,
          description: `${engineData.play_type} - ${engineData.stats.passes} pases, ${engineData.stats.screens} bloqueos`,
          frames,
          engineData,
          efficiency: 50, // Inicial
          familiarity: 0,
          timesUsed: 0,
          timesSuccessful: 0
        });

        // Actualizar estado local
        const localPlay: SavedPlay = {
          id: dbPlay.id,
          name: dbPlay.name,
          date: new Date().toLocaleDateString(),
          frames: dbPlay.frames,
          engineData: dbPlay.engineData
        };
        setSavedPlays(prev => [...prev, localPlay]);
        if (onSaveCustomPlay) {
          onSaveCustomPlay({
            id: localPlay.id,
            name: localPlay.name,
            type: engineData.play_type || 'Set',
            focus: engineData.focus || 'Pick & Roll',
            situation: 'Halfcourt',
            notes: `${engineData.play_type} - ${engineData.stats.passes} pases, ${engineData.stats.screens} bloqueos`
          });
        }
        setIsSaving(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        return dbPlay.id;
      } catch (err) {
        console.error('Error guardando en DB:', err);
        setIsSaving(false);
        // Fallback a localStorage
      }
    }

    // Guardar en localStorage (fallback o si no hay clubId)
    const newPlay: SavedPlay = {
      id: Date.now().toString(),
      name: playName,
      date: new Date().toLocaleDateString(),
      frames,
      engineData
    };
    const updatedPlays = [...savedPlays, newPlay];
    setSavedPlays(updatedPlays);
    localStorage.setItem('my_playbook_plays', JSON.stringify(updatedPlays));
    if (onSaveCustomPlay) {
      onSaveCustomPlay({
        id: newPlay.id,
        name: newPlay.name,
        type: engineData.play_type || 'Set',
        focus: engineData.focus || 'Pick & Roll',
        situation: 'Halfcourt',
        notes: `${engineData.play_type} - ${engineData.stats.passes} pases, ${engineData.stats.screens} bloqueos`
      });
    }
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
    return newPlay.id;
  };

  const createPlaybook = async () => {
    if (!newPbName.trim()) return;

    if (clubId && useDatabase) {
      try {
        const dbPlaybook = await savePlaybookToDB({
          clubId,
          name: newPbName,
          playIds: [],
          isActive: false
        });

        const localPb: Playbook = {
          id: dbPlaybook.id,
          name: dbPlaybook.name,
          playIds: dbPlaybook.playIds
        };
        setPlaybooks(prev => [...prev, localPb]);
      } catch (err) {
        console.error('Error creando playbook en DB:', err);
      }
    } else {
      const newPb: Playbook = { id: Date.now().toString(), name: newPbName, playIds: [] };
      const updatedPbs = [...playbooks, newPb];
      setPlaybooks(updatedPbs);
      localStorage.setItem('my_playbooks', JSON.stringify(updatedPbs));
    }

    setNewPbName("");
    setModalMode('none');
  };

  const deletePlaybook = async (pbId: string) => {
    if (!window.confirm("¿Seguro que quieres eliminar este Playbook?")) return;

    if (clubId && useDatabase) {
      try {
        await deletePlaybookFromDB(pbId);
      } catch (err) {
        console.error('Error eliminando playbook de DB:', err);
      }
    }

    const updated = playbooks.filter(pb => pb.id !== pbId);
    setPlaybooks(updated);
    localStorage.setItem('my_playbooks', JSON.stringify(updated));
    if (selectedPbForEdit && selectedPbForEdit.id === pbId) setSelectedPbForEdit(null);
  };

  const addCurrentPlayToPlaybook = async (pbId: string) => {
    const playId = await savePlay();
    const targetPb = playbooks.find(pb => pb.id === pbId);
    if (!targetPb) return;

    const updatedPlayIds = [...targetPb.playIds, playId];

    if (clubId && useDatabase) {
      try {
        await updatePlaybookDB({
          ...targetPb,
          clubId,
          playIds: updatedPlayIds,
          isActive: false,
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        console.error('Error actualizando playbook en DB:', err);
      }
    }

    const updatedPbs = playbooks.map(pb => {
      if (pb.id === pbId) {
        if (!pb.playIds.includes(playId)) return { ...pb, playIds: updatedPlayIds };
      }
      return pb;
    });
    setPlaybooks(updatedPbs);
    localStorage.setItem('my_playbooks', JSON.stringify(updatedPbs));
    setShowAddToPbDropdown(false);
    alert(`Jugada añadida al playbook.`);
  };

  const activatePlaybook = async (pbId: string) => {
    if (clubId && useDatabase) {
      try {
        await setActivePlaybook(clubId, pbId);
        alert('Playbook activado. Se usará en los próximos partidos.');
      } catch (err) {
        console.error('Error activando playbook:', err);
      }
    }
  };

  const updatePlaybookName = async (pbId: string, newName: string) => {
    const targetPb = playbooks.find(pb => pb.id === pbId);

    if (clubId && useDatabase && targetPb) {
      try {
        await updatePlaybookDB({
          ...targetPb,
          clubId,
          name: newName,
          isActive: false,
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        console.error('Error actualizando playbook en DB:', err);
      }
    }

    const updated = playbooks.map(pb => pb.id === pbId ? {...pb, name: newName} : pb);
    setPlaybooks(updated);
    localStorage.setItem('my_playbooks', JSON.stringify(updated));
    if (selectedPbForEdit) setSelectedPbForEdit({...selectedPbForEdit, name: newName});
  };

  const removePlayFromPlaybook = async (pbId: string, playIdToRemove: string) => {
    const targetPb = playbooks.find(pb => pb.id === pbId);
    if (!targetPb) return;

    const updatedPlayIds = targetPb.playIds.filter(pid => pid !== playIdToRemove);

    if (clubId && useDatabase) {
      try {
        await updatePlaybookDB({
          ...targetPb,
          clubId,
          playIds: updatedPlayIds,
          isActive: false,
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        console.error('Error actualizando playbook en DB:', err);
      }
    }

    const updated = playbooks.map(pb => {
      if (pb.id === pbId) return { ...pb, playIds: updatedPlayIds };
      return pb;
    });
    setPlaybooks(updated);
    localStorage.setItem('my_playbooks', JSON.stringify(updated));
    if (selectedPbForEdit && selectedPbForEdit.id === pbId) {
      setSelectedPbForEdit({ ...selectedPbForEdit, playIds: updatedPlayIds });
    }
  };

  // --- ACTIONS ---
  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getSVGPoint(e);
    if (activeTool === 'select') {
        const player = currentFrame.players.find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 30);
        if (player) { setDragging({ type: 'player', id: player.id }); return; }
        if (currentFrame.ballOwnerId === null && Math.hypot(currentFrame.ballPosition.x - pos.x, currentFrame.ballPosition.y - pos.y) < 20) { setDragging({ type: 'ball' }); return; }
        const defIndex = currentFrame.defenders.findIndex(d => Math.hypot(d.x - pos.x, d.y - pos.y) < 30);
        if (defIndex !== -1) { setDragging({ type: 'defender', index: defIndex }); return; }
        return;
    }
    if (activeTool === 'defender') { updateFrame({ defenders: [...currentFrame.defenders, pos] }); return; }
    
    const player = currentFrame.players.find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 35);
    if (activeTool === 'pass') {
        const isBallOwner = player && player.id === currentFrame.ballOwnerId;
        const isLooseBall = currentFrame.ballOwnerId === null && Math.hypot(currentFrame.ballPosition.x - pos.x, currentFrame.ballPosition.y - pos.y) < 30;
        if (isBallOwner || isLooseBall) {
            setIsDrawing(true); setCurrentPathPoints([isBallOwner ? {x: player.x, y: player.y} : currentFrame.ballPosition]); setDrawingLinkedId(undefined);
        }
        return;
    }
    if (player) {
        setIsDrawing(true); setCurrentPathPoints([{x: player.x, y: player.y}]); setDrawingLinkedId(player.id);
        if (activeTool === 'move' && player.id === currentFrame.ballOwnerId) { setWarning(`⚠️ ¡PASOS! ${player.label} tiene balón.`); setTimeout(() => setWarning(null), 3000); }
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const pos = getSVGPoint(e);
    if (dragging) {
        if (dragging.type === 'player') {
            const newPlayers = [...currentFrame.players]; const p = newPlayers.find(pl => pl.id === dragging.id);
            if (p) { p.x = pos.x; p.y = pos.y; }
            if (currentFrame.ballOwnerId === dragging.id) updateFrame({ players: newPlayers, ballPosition: pos }); else updateFrame({ players: newPlayers });
        } else if (dragging.type === 'ball') updateFrame({ ballPosition: pos, ballOwnerId: null });
        else if (dragging.type === 'defender' && dragging.index !== undefined) {
            const newDefs = [...currentFrame.defenders]; newDefs[dragging.index] = pos; updateFrame({ defenders: newDefs });
        }
        return;
    }
    if (isDrawing) {
        if (activeTool === 'pass') setCurrentPathPoints([currentPathPoints[0], pos]);
        else if (Math.hypot(currentPathPoints[currentPathPoints.length - 1].x - pos.x, currentPathPoints[currentPathPoints.length - 1].y - pos.y) > 3) setCurrentPathPoints(prev => [...prev, pos]);
    }
  };

  const onMouseUp = () => {
    if (dragging) {
        if (dragging.type === 'ball') {
            const p = currentFrame.players.find(pl => Math.hypot(pl.x - currentFrame.ballPosition.x, pl.y - currentFrame.ballPosition.y) < 30);
            if (p) updateFrame({ ballOwnerId: p.id });
        }
        setDragging(null); return;
    }
    if (isDrawing) {
        if (currentPathPoints.length > 1) { 
            if (activeTool === 'pass') {
                const last = currentPathPoints[currentPathPoints.length-1];
                const target = currentFrame.players.find(p => Math.hypot(p.x - last.x, p.y - last.y) < 30);
                if (target) { const newPoints = [...currentPathPoints]; newPoints[newPoints.length-1] = {x: target.x, y: target.y}; setCurrentPathPoints(newPoints); }
            }
            const newPath: ActionPath = { id: Date.now(), type: activeTool as any, points: currentPathPoints, linkedId: drawingLinkedId };
            updateFrame({ paths: [...currentFrame.paths, newPath] });
        }
        setIsDrawing(false); setCurrentPathPoints([]); setDrawingLinkedId(undefined);
    }
  };

  const addFrame = () => {
    const nextPlayers = JSON.parse(JSON.stringify(currentFrame.players));
    let nextBallOwner = currentFrame.ballOwnerId; let nextBallPos = { ...currentFrame.ballPosition };
    currentFrame.paths.forEach(path => {
       const endP = path.points[path.points.length - 1];
       if (path.linkedId && ['move', 'dribble', 'screen'].includes(path.type)) { const pIndex = nextPlayers.findIndex((pl: PlayerToken) => pl.id === path.linkedId); if (pIndex !== -1) { nextPlayers[pIndex].x = endP.x; nextPlayers[pIndex].y = endP.y; } }
       if (path.type === 'pass') { nextBallOwner = null; nextBallPos = { x: endP.x, y: endP.y }; const receiver = nextPlayers.find((pl: PlayerToken) => Math.hypot(pl.x - endP.x, pl.y - endP.y) < 30); if (receiver) nextBallOwner = receiver.id; }
    });
    if (nextBallOwner !== null) { const owner = nextPlayers.find((p: PlayerToken) => p.id === nextBallOwner); if (owner) nextBallPos = { x: owner.x, y: owner.y }; }
    setFrames([...frames, { players: nextPlayers, ballOwnerId: nextBallOwner, ballPosition: nextBallPos, paths: [], defenders: [...currentFrame.defenders] }]);
    setCurrentFrameIndex(frames.length);
  };

  const deleteFrame = (index: number) => {
    if (frames.length <= 1) return;
    const newFrames = frames.filter((_, i) => i !== index);
    setFrames(newFrames);
    // Ajustar índice si es necesario para evitar apuntar fuera
    if (currentFrameIndex >= newFrames.length) {
        setCurrentFrameIndex(newFrames.length - 1);
    }
  };

  const updateFrame = (newData: Partial<FrameData>) => { const newFrames = [...frames]; newFrames[currentFrameIndex] = { ...currentFrame, ...newData }; setFrames(newFrames); };
  
  useEffect(() => { 
      let interval: any; 
      if (isPlaying) { 
          interval = setInterval(() => { 
              setCurrentFrameIndex(prev => { 
                  if (prev >= frames.length - 1) { setIsPlaying(false); return 0; } 
                  return prev + 1; 
              }); 
          }, 800); 
      } 
      return () => clearInterval(interval); 
  }, [isPlaying, frames.length]);

  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', width:'100%', gap:10, fontFamily:'sans-serif', overflow:'hidden', position:'relative'}}>
      
      {/* MODALES */}
      {modalMode === 'load' && (
          <div style={modalOverlay}>
              <div style={modalContent}>
                  <h3>Cargar Jugada</h3>
                  <div style={listContainer}>
                      {savedPlays.length === 0 ? <p style={{color:'#94a3b8'}}>No hay jugadas guardadas.</p> : savedPlays.map(play => (
                          <div key={play.id} onClick={()=>{ setFrames(play.frames); setPlayName(play.name); setCurrentFrameIndex(0); setModalMode('none'); }} style={listItem}>
                              <div><div style={{color:'white', fontWeight:'bold'}}>{play.name}</div><div style={{color:'#64748b', fontSize:'0.8rem'}}>{play.date}</div></div>
                              <Play size={16} color="#fbbf24"/>
                          </div>
                      ))}
                  </div>
                  <button onClick={()=>setModalMode('none')} style={closeBtn}>Cerrar</button>
              </div>
          </div>
      )}

      {modalMode === 'createPB' && (
          <div style={modalOverlay}>
              <div style={modalContent}>
                  <h3>Nuevo Playbook</h3>
                  <input type="text" placeholder="Nombre (ej: Ataque Zona)" value={newPbName} onChange={e=>setNewPbName(e.target.value)} style={inputStyle} />
                  <div style={{display:'flex', gap:10, marginTop:20}}>
                      <button onClick={createPlaybook} style={primaryBtn}>Crear</button>
                      <button onClick={()=>setModalMode('none')} style={closeBtn}>Cancelar</button>
                  </div>
              </div>
          </div>
      )}

      {modalMode === 'editPB' && (
          <div style={modalOverlay}>
              <div style={{...modalContent, width: 600}}>
                  <h3>Editar Playbooks</h3>
                  {!selectedPbForEdit ? (
                      <div style={listContainer}>
                          {playbooks.length === 0 ? <p style={{color:'#94a3b8'}}>No tienes playbooks.</p> : playbooks.map(pb => (
                              <div key={pb.id} onClick={()=>setSelectedPbForEdit(pb)} style={listItem}>
                                  <div style={{display:'flex', alignItems:'center', gap:10}}><Book size={20} color="#38bdf8"/><div><div style={{color:'white', fontWeight:'bold'}}>{pb.name}</div><div style={{color:'#64748b', fontSize:'0.8rem'}}>{pb.playIds.length} jugadas</div></div></div>
                                  <div style={{display:'flex', gap:10}}>
                                      <button onClick={(e)=>{e.stopPropagation(); deletePlaybook(pb.id)}} style={{background:'transparent', border:'none', color:'#ef4444', cursor:'pointer'}}><Trash2 size={16}/></button>
                                      <Settings size={16} color="#94a3b8"/>
                                  </div>
                              </div>
                          ))}
                      </div>
                  ) : (
                      <div>
                          <div style={{display:'flex', gap:10, marginBottom:20}}>
                              <button onClick={()=>setSelectedPbForEdit(null)} style={{background:'transparent', border:'none', color:'#fbbf24', cursor:'pointer'}}><SkipBack/></button>
                              <input type="text" value={selectedPbForEdit.name} onChange={e=>updatePlaybookName(selectedPbForEdit.id, e.target.value)} style={{...inputStyle, flex:1}} />
                          </div>
                          <div style={{...listContainer, maxHeight:250}}>
                              {selectedPbForEdit.playIds.length === 0 ? <p style={{color:'#94a3b8'}}>Vacío.</p> : selectedPbForEdit.playIds.map(pid => {
                                    const play = savedPlays.find(p => p.id === pid);
                                    if(!play) return null;
                                    return (
                                        <div key={pid} style={{...listItem, cursor:'default'}}>
                                            <span style={{color:'white'}}>{play.name}</span>
                                            <button onClick={()=>removePlayFromPlaybook(selectedPbForEdit.id, pid)} style={{background:'transparent', border:'none', color:'#ef4444', cursor:'pointer'}}><Trash2 size={16}/></button>
                                        </div>
                                    )
                                })}
                          </div>
                      </div>
                  )}
                  <button onClick={()=>setModalMode('none')} style={{...closeBtn, marginTop:20}}>Cerrar</button>
              </div>
          </div>
      )}

      {/* HEADER */}
      <div style={{flexShrink:0, padding:'8px 15px', background: THEME.bg, borderRadius:8, border:'1px solid #334155', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{display:'flex', alignItems:'center', gap:15}}>
             <input type="text" value={playName} onChange={(e) => setPlayName(e.target.value)} style={{background:'transparent', border:'none', color:'white', fontSize:'1.1rem', fontWeight:'bold', borderBottom:'1px solid #475569', paddingBottom:2, outline:'none', width:200}}/>
             <span style={{color:'#94a3b8', fontSize:'0.75rem'}}>Frame <b style={{color: THEME.passColor}}>{displayIndex + 1}/{frames.length}</b></span>
        </div>
        <div style={{display:'flex', gap:8}}>
             <button onClick={()=>setModalMode('createPB')} style={textBtn}><PlusSquare size={16}/> Crear PB</button>
             <button onClick={()=>setModalMode('editPB')} style={textBtn}><BookOpen size={16}/> Editar PB</button>
             <div style={{position:'relative'}}>
                 <button onClick={()=>setShowAddToPbDropdown(!showAddToPbDropdown)} style={{...textBtn, padding:'5px 10px'}}><Book size={16}/> Añadir a...</button>
                 {showAddToPbDropdown && (
                     <div style={{position:'absolute', top:'100%', right:0, marginTop:5, background:'#1e293b', border:'1px solid #334155', borderRadius:6, width:200, zIndex:100, boxShadow:'0 4px 10px rgba(0,0,0,0.5)'}}>
                         {playbooks.length === 0 ? <div style={{padding:10, color:'#94a3b8', fontSize:'0.8rem'}}>No hay playbooks</div> : playbooks.map(pb => (
                                <div key={pb.id} onClick={()=>addCurrentPlayToPlaybook(pb.id)} style={{padding:'8px 12px', color:'white', cursor:'pointer', borderBottom:'1px solid #334155', fontSize:'0.85rem'}}>{pb.name}</div>
                            ))}
                     </div>
                 )}
             </div>
             <div style={{width:1, height:20, background:'#334155', margin:'0 5px'}}></div>
             <button onClick={()=>setModalMode('load')} style={textBtn}><FolderOpen size={14}/> Cargar</button>
             <button onClick={() => savePlay()} style={saveBtn}><Save size={14}/> Guardar</button>
        </div>
      </div>

      <div style={{flex:1, display:'flex', gap:10, minHeight:0, overflow:'hidden'}}>
          {/* TOOLBAR */}
          <div style={{width: 70, background: THEME.bg, borderRadius:8, border:'1px solid #334155', display:'flex', flexDirection:'column', alignItems:'center', padding:'15px 0', gap: 8, overflowY:'auto'}}>
             <ToolBtn icon={<MousePointer2 size={20}/>} label="Select" active={activeTool==='select'} onClick={()=>setActiveTool('select')} />
             <div style={{width:'60%', height:1, background:'#334155', margin:'5px 0'}}></div>
             <ToolBtn icon={<Circle size={20}/>} label="Corte" active={activeTool==='move'} onClick={()=>setActiveTool('move')} color={THEME.moveColor}/>
             <ToolBtn icon={<ArrowRight size={20} style={{borderBottom:'2px dashed currentColor'}}/>} label="Pase" active={activeTool==='pass'} onClick={()=>setActiveTool('pass')} color={THEME.passColor}/>
             <ToolBtn icon={<Move size={20}/>} label="Bote" active={activeTool==='dribble'} onClick={()=>setActiveTool('dribble')} color={THEME.dribbleColor}/>
             <ToolBtn icon={<Type size={20} style={{fontWeight:'bold'}}/>} label="Bloqueo" active={activeTool==='screen'} onClick={()=>setActiveTool('screen')} color={THEME.screenColor}/>
             <div style={{width:'60%', height:1, background:'#334155', margin:'5px 0'}}></div>
             <ToolBtn icon={<X size={24} style={{fontWeight:'bold'}}/>} label="Defensa" active={activeTool==='defender'} onClick={()=>setActiveTool('defender')} color={THEME.defColor}/>
             <div style={{marginTop:'auto'}}><button onClick={() => updateFrame({ paths: [] })} style={{background:'transparent', border:'none', color:'#94a3b8', cursor:'pointer'}} title="Borrar"><Eraser size={18}/></button></div>
          </div>

          {/* CANVAS */}
          <div style={{flex:1, background:'#0f172a', borderRadius:8, border:'1px solid #334155', display:'flex', alignItems: 'center', justifyContent: 'center', overflow:'hidden', position:'relative'}}>
             {warning && <div style={{position:'absolute', top:20, background:'#ef4444', color:'white', padding:'5px 10px', borderRadius:4, zIndex:10, display:'flex', gap:5, alignItems:'center'}}><AlertTriangle size={16}/> {warning}</div>}
             <svg 
                ref={svgRef} viewBox="0 0 500 470" preserveAspectRatio="xMidYMid meet"
                style={{maxHeight:'95%', maxWidth:'95%', aspectRatio:'50/47', background: THEME.bg, border:'2px solid #334155', cursor: activeTool==='select'?(dragging?'grabbing':'default'):'crosshair', boxShadow:'0 0 40px rgba(0,0,0,0.5)', touchAction:'none'}}
                onMouseDown={handleMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onDoubleClick={(e)=>{const p=getSVGPoint(e); const pl=currentFrame.players.find(x=>Math.hypot(x.x-p.x,x.y-p.y)<35); if(pl&&activeTool==='select') updateFrame({ballOwnerId:pl.id})}}
             >
                <defs>
                  <marker id="arrow-white" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill={THEME.moveColor} /></marker>
                  <marker id="arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill={THEME.dribbleColor} /></marker>
                  <marker id="arrow-yellow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill={THEME.passColor} /></marker>
                </defs>
                <g stroke={THEME.courtLines} strokeWidth="2" fill="none">
                    <rect x="0" y="0" width="500" height="470" /> <rect x="170" y="0" width="160" height="190" />
                    <path d="M 330,190 A 80,80 0 0,1 170,190" /> <path d="M 170,190 A 80,80 0 0,0 330,190" strokeDasharray="10,10" />
                    <line x1="220" y1="40" x2="280" y2="40" strokeWidth="3" stroke="white"/> <circle cx="250" cy="52.5" r="7.5" stroke="#f97316" strokeWidth="2"/>
                    <path d="M 30,0 L 30,140 A 237.5,237.5 0 0,0 470,140 L 470,0" /> <path d="M 190,470 A 60,60 0 0,1 310,470" />
                </g>
                {currentFrame.paths.map(path => {
                    let d='', color=THEME.moveColor, dash='0', marker='', extra=null;
                    if(path.type==='pass'){d=pointsToStraightPath(path.points); color=THEME.passColor; dash='8,8'; marker='url(#arrow-yellow)';}
                    else if(path.type==='dribble'){d=getZigZagOnPath(path.points); color=THEME.dribbleColor; marker='url(#arrow-blue)';}
                    else if(path.type==='screen'){d=pointsToCurvedPath(path.points); color=THEME.screenColor; extra=<path d={getScreenHammer(path.points)} stroke={color} strokeWidth="4" fill="none" strokeLinecap="round"/>;}
                    else {d=pointsToCurvedPath(path.points); color=THEME.moveColor; marker='url(#arrow-white)';}
                    return <g key={path.id}><path d={d} stroke={color} strokeWidth="3" fill="none" strokeDasharray={dash} markerEnd={marker} strokeLinecap="round" strokeLinejoin="round"/>{extra}</g>
                })}
                {isDrawing && currentPathPoints.length > 0 && <path d={activeTool==='pass'?pointsToStraightPath([currentPathPoints[0], currentPathPoints[currentPathPoints.length-1]]) : pointsToCurvedPath(currentPathPoints)} stroke="rgba(255,255,255,0.5)" strokeWidth="3" fill="none" />}
                {currentFrame.players.map(p => (
                    <g key={p.id} transform={`translate(${p.x},${p.y})`} style={{cursor:'pointer'}}>
                        <circle r="16" fill={THEME.bg} stroke={THEME.moveColor} strokeWidth="2"/>
                        {currentFrame.ballOwnerId === p.id && <circle r="19" fill="none" stroke={THEME.passColor} strokeWidth="3" opacity="0.8"/>}
                        <text dy=".35em" textAnchor="middle" fontSize="14" fontWeight="bold" fill={THEME.moveColor} fontFamily="Arial">{p.label}</text>
                    </g>
                ))}
                {currentFrame.ballOwnerId===null && <circle cx={currentFrame.ballPosition.x} cy={currentFrame.ballPosition.y} r="9" fill={THEME.passColor} stroke="black" strokeWidth="1"/>}
                {currentFrame.defenders.map((d,i)=><text key={i} x={d.x} y={d.y} dy=".35em" textAnchor="middle" fontSize="28" fontWeight="bold" fill={THEME.defColor} style={{cursor:'default'}}>X</text>)}
             </svg>
          </div>

          {/* RESUMEN LATERAL */}
          <div style={{width: 180, background:'#1e293b', borderLeft:'1px solid #334155', padding:15, overflowY:'auto'}}>
              <div style={{fontSize:'0.75rem', fontWeight:'bold', color:'#94a3b8', marginBottom:15, display:'flex', alignItems:'center', gap:5, borderBottom:'1px solid #334155', paddingBottom:10}}><ListChecks size={16}/> RESUMEN</div>
              {currentFrame.paths.length === 0 && <span style={{fontSize:'0.7rem', color:'#64748b'}}>Sin acciones</span>}
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                {currentFrame.paths.map((p,i) => {
                    const pl = currentFrame.players.find(x=>x.id===p.linkedId);
                    return (<div key={i} style={{fontSize:'0.75rem', color:'#e2e8f0', background:'rgba(255,255,255,0.03)', padding:'8px', borderRadius:6, borderLeft:`3px solid ${p.type==='pass'?THEME.passColor:(p.type==='dribble'?THEME.dribbleColor:(p.type==='screen'?THEME.screenColor:THEME.moveColor))}`}}>
                        <div style={{fontWeight:'bold', color:'#94a3b8', fontSize:'0.65rem', marginBottom:2}}>{pl ? `JUGADOR ${pl.label}` : 'JUGADOR'}</div>
                        <div>{p.type.toUpperCase()}</div>
                    </div>)
                })}
              </div>
          </div>
      </div>

      {/* TIMELINE */}
      <div style={{flexShrink: 0, height: 80, background: THEME.bg, borderRadius:8, border:'1px solid #334155', display:'flex', alignItems:'center', padding:'0 20px', gap:20}}>
          <div style={{display:'flex', gap:10, alignItems:'center'}}>
             <button onClick={() => setCurrentFrameIndex(0)} style={timelineControlBtn} title="Inicio"><SkipBack size={18}/></button>
             <button onClick={() => setIsPlaying(!isPlaying)} style={{...timelineControlBtn, background: isPlaying ? '#ef4444':'#22c55e', border:'none', color:'black', width:45, height:45}}>{isPlaying ? <Pause size={20}/> : <Play size={20}/>}</button>
          </div>
          <div style={{width:1, height:'50%', background:'#334155'}}></div>
          <div style={{flex:1, display:'flex', gap:10, overflowX:'auto', paddingBottom:5, alignItems:'center'}}>
             {frames.map((_, index) => (
                <div key={index} onClick={() => { setIsPlaying(false); setCurrentFrameIndex(index); }} style={{minWidth: 60, height: 60, borderRadius: 8, border: displayIndex === index ? `2px solid ${THEME.dribbleColor}` : '1px solid #475569', background: displayIndex === index ? 'rgba(56, 189, 248, 0.1)' : '#0f172a', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative'}}>
                   <span style={{fontSize:'1rem', fontWeight:'bold', color: displayIndex === index ? THEME.dribbleColor : '#64748b'}}>{index + 1}</span>
                   {frames.length > 1 && <button onClick={(e) => { e.stopPropagation(); deleteFrame(index); }} style={{position:'absolute', top:-5, right:-5, background:'#ef4444', border:'none', color:'white', width:18, height:18, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:0}}><Trash2 size={10}/></button>}
                </div>
             ))}
             <button onClick={addFrame} style={{minWidth: 60, height: 60, borderRadius: 8, border:'1px dashed #64748b', background:'transparent', color:'#94a3b8', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5}}><Plus size={20}/><span style={{fontSize:'0.6rem'}}>AÑADIR</span></button>
          </div>
      </div>
    </div>
  );
}

// ESTILOS INLINE
const ToolBtn = ({icon, label, active, onClick, color}:any) => (<button onClick={onClick} style={{width: 50, height: 50, borderRadius: 6, border: active ? `2px solid ${color || 'white'}` : '1px solid transparent', background: active ? 'rgba(255,255,255,0.08)' : 'transparent', color: active ? (color || 'white') : '#94a3b8', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap: 2, cursor:'pointer', transition:'all 0.2s', flexShrink: 0}}>{icon}<span style={{fontSize:'0.6rem', fontWeight: active?'bold':'normal'}}>{label}</span></button>);
const timelineControlBtn = { width: 40, height: 40, borderRadius:'50%', background:'#0f172a', border:'1px solid #475569', color:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' };
const textBtn = {background:'#334155', border:'1px solid #475569', color:'white', padding:'5px 12px', borderRadius:4, fontWeight:'bold', display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:'0.8rem'};
const saveBtn = {background:'#22c55e', border:'none', color:'black', padding:'5px 15px', borderRadius:4, fontWeight:'bold', display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:'0.8rem'};
const iconBtn = {background:'#334155', border:'1px solid #475569', color:'white', width:32, height:32, borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer'};
const modalOverlay: any = {position:'absolute', inset:0, background:'rgba(0,0,0,0.8)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center'};
const modalContent: any = {width:400, background:'#1e293b', borderRadius:10, padding:20, border:'1px solid #475569'};
const listContainer: any = {maxHeight:300, overflowY:'auto', display:'flex', flexDirection:'column', gap:10, marginBottom:20};
const listItem: any = {padding:10, background:'#0f172a', borderRadius:6, cursor:'pointer', border:'1px solid #334155', display:'flex', justifyContent:'space-between', alignItems:'center'};
const inputStyle: any = {width:'100%', padding:10, background:'#0f172a', border:'1px solid #475569', color:'white', borderRadius:6, outline:'none'};
const primaryBtn: any = {flex:1, padding:10, background:'#38bdf8', color:'black', border:'none', borderRadius:6, cursor:'pointer', fontWeight:'bold'};
const closeBtn: any = {flex:1, padding:10, background:'#334155', color:'white', border:'none', borderRadius:6, cursor:'pointer'};
