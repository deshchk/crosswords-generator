import { useGeneratorLogic, GEN_ATTEMPTS, TOP_ITERATIONS_COUNT } from './GeneratorLogic'

const GeneratorUI = () => {
  const {
    newWordInput, setNewWordInput, newHintInput, setNewHintInput,
    passwordInput, setPasswordInput, hintInput, setHintInput,
    wordEntries, enabledCount, sorted,
    placedWords, allPlacedWords, uniqueLetters,
    hiddenWords, disconnectedHiddenWords, hideWords,
    toggleWordVisibility, handleHideWordsChange,
    grid, rotateGrid, indicateVowels, indicatePolishChars, revealedLetters,
    handleIndicateVowelsChange, handleIndicatePolishCharsChange, handleRevealedLettersChange,
    iterationsRef, generatedIterations, selectedIterationIndex, sortedIterations, topIterations,
    iterationsExpanded, setIterationsExpanded, renderIterationCard,
    toggleEnabled, updateWord, updateHint, removeEntry, addWord, selectAllEntries, removeAllEntries,
    prevIteration, nextIteration, scrollToIterations, isIterationBest,
    isGenerating, generationProgress, handleGenerate, stats,
    downloadSVG, renderCrosswordSVG
  } = useGeneratorLogic()

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="text-center mb-10">
          <h1 className="text-6xl font-black text-white mb-2 tracking-wide uppercase"><span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">Generator Krzyżówek</span></h1>
          <p className="text-slate-400 text-sm">Łatwo i szybko wygeneruj własną krzyżówkę... bądź dwie... -ście! <span className="ml-2">😎</span></p>
        </header>
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 flex flex-col bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden">
            <div className="px-5 py-4 bg-slate-700/30 border-b border-slate-700/50 flex items-center justify-between gap-x-3">
              <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg></div><h2 className="text-lg font-semibold text-white whitespace-nowrap">Lista słów</h2></div>
              <div className="flex items-center justify-end gap-x-4 gap-y-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <button onClick={selectAllEntries} className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">{wordEntries.some(e => !e.enabled) ? <span>Zaznacz</span> : <span>Odznacz</span>} wszystkie</button>
                  <button onClick={removeAllEntries} className="px-3 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">Usuń wszystkie</button>
                </div>
                <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${enabledCount !== 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-600/50 text-slate-400 border border-slate-600/50'}`}>
                  <span>{enabledCount}</span>/<span>{wordEntries.length}</span>
                </div>
              </div>
            </div>
            <div className="p-4 max-h-[317px] overflow-y-auto">
              <div className="space-y-2">
                {wordEntries.map((e, i) => (
                  <div key={i} className={`group flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${e.enabled ? 'bg-slate-700/40 hover:bg-slate-700/60 border border-slate-600/30' : 'bg-slate-800/30 opacity-60 border border-transparent'}`}>
                    <label className="relative flex items-center cursor-pointer"><input type="checkbox" checked={e.enabled} onChange={() => toggleEnabled(i)} className="peer sr-only" /><div className="w-5 h-5 rounded-md border-2 border-slate-500 peer-checked:border-amber-500 peer-checked:bg-amber-500 transition-all flex items-center justify-center"><svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg></div></label>
                    <input type="text" value={e.word} onChange={ev => updateWord(i, ev.target.value)} className="w-28 px-3 py-1.5 bg-slate-900/50 border border-slate-600/50 rounded-lg font-mono uppercase text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all" placeholder="wyraz" />
                    <input type="text" value={e.hint} onChange={ev => updateHint(i, ev.target.value)} className="flex-1 px-3 py-1.5 bg-slate-900/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all" placeholder="podpowiedź, definicja" />
                    <button onClick={() => removeEntry(i)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 bg-slate-700/20 border-t border-slate-700/50 mt-auto">
              <div className="flex gap-2">
                <input type="text" value={newWordInput} onChange={e => setNewWordInput(e.target.value)} className="w-32 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg font-mono uppercase text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all" placeholder="nowy wyraz" onKeyDown={e => e.key === 'Enter' && addWord()} />
                <input type="text" value={newHintInput} onChange={e => setNewHintInput(e.target.value)} className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all" placeholder="podpowiedź, definicja" onKeyDown={e => e.key === 'Enter' && addWord()} />
                <button onClick={addWord} className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-medium rounded-lg transition-all duration-200 flex items-center gap-2 shadow-lg shadow-emerald-500/20"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Dodaj</button>
              </div>
            </div>
          </div>
          <div className={`grid gap-6 ${isGenerating ? 'grid-rows-[auto_auto]' : 'grid-rows-[auto_auto_1fr]'}`}>
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden">
              <div className="px-5 py-4 bg-slate-700/30 border-b border-slate-700/50 flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg></div><h2 className="text-lg font-semibold text-white">Rozwiązanie krzyżówki</h2></div>
              <div className="p-5 space-y-4">
                <div><label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Rozwiązanie</label><input className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-lg font-mono uppercase text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all" placeholder="wspaniałe stulecie" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} /></div>
                <div><label className="block text-xs font-medium text-slate-400 italic tracking-wider mb-2"><span className="not-italic uppercase">Podpowiedź</span> "Rozwiązaniem jest..."</label><input className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all" placeholder="jeden z Twoich ulubionych seriali" value={hintInput} onChange={e => setHintInput(e.target.value)} /></div>
              </div>
            </div>
            {isGenerating ? (
              <div className="p-6 rounded-xl border bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="relative"><div className="w-12 h-12 rounded-full border-4 border-amber-500/30 border-t-amber-500 animate-spin"></div><div className="absolute inset-0 flex items-center justify-center"><svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div></div>
                  <div className="flex-1"><p className="text-amber-400 font-semibold mb-1">Generowanie krzyżówki...</p><p className="text-slate-400 text-sm">{stats}</p></div>
                </div>
                {generatedIterations.length > 0 && <div className="mt-4 pt-4 border-t border-amber-500/20"><div className="flex items-center justify-between text-sm"><span className="text-slate-400">Znaleziono unikatowych iteracji:</span><span className="text-amber-400 font-mono font-bold">{generatedIterations.length}</span></div><div className="mt-2 h-2 bg-slate-700/50 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-300 rounded" style={{ width: `${(generationProgress.current / (GEN_ATTEMPTS)) * 100}%` }}></div></div></div>}
              </div>
            ) : (
              <div className="flex gap-3"><button className={`flex-1 py-3.5 px-6 rounded-xl font-semibold text-white transition-all duration-300 flex items-center justify-center gap-2 shadow-xl ${isGenerating ? 'bg-gradient-to-r from-amber-600 to-orange-600' : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 hover:shadow-amber-500/30 hover:scale-[1.02]'}`} onClick={handleGenerate} disabled={isGenerating}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Generuj</button></div>
            )}
            {!isGenerating && stats && <div className={`p-4 rounded-xl border grid place-items-center text-center ${stats.includes('✅') ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : stats.includes('❌') ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-slate-700/30 border-slate-600/30 text-slate-300'}`}><p className="text-sm font-mono">{stats}</p></div>}
          </div>
        </div>
        {isGenerating && generatedIterations.length > 0 && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden mb-8">
            <div className="px-5 py-4 bg-slate-700/30 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-blue-500 flex items-center justify-center animate-pulse"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg></div><h2 className="text-lg font-semibold text-white">Najlepsze iteracje</h2></div>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 animate-pulse">Top {Math.min(10, generatedIterations.length)} z {generatedIterations.length}</span>
            </div>
            <div className="p-5"><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{sortedIterations.slice(0, 10).map((iter, sortedIndex) => { const originalIndex = generatedIterations.findIndex(i => i.id === iter.id); return renderIterationCard(iter, originalIndex, sortedIndex, false) })}</div></div>
          </div>
        )}
        {!isGenerating && generatedIterations.length > 1 && (
          <div ref={iterationsRef} className="scroll-mt-5 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden mb-8">
            <button onClick={() => setIterationsExpanded(!iterationsExpanded)} className="w-full px-5 py-4 bg-slate-700/30 border-b border-slate-700/50 flex items-center justify-between hover:bg-slate-700/50 transition-colors">
              <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-blue-500 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg></div><h2 className="text-lg font-semibold text-white">Najlepsze iteracje</h2></div>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">top {Math.min(TOP_ITERATIONS_COUNT, generatedIterations.length)} z {generatedIterations.length}</span>
                <svg className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${iterationsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </button>
            {iterationsExpanded && <div className="p-5"><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{topIterations.map((iter, sortedIndex) => { const originalIndex = generatedIterations.findIndex(i => i.id === iter.id); return renderIterationCard(iter, originalIndex, sortedIndex, true) })}</div></div>}
          </div>
        )}
        {!isGenerating && grid && placedWords.length > 0 && (
          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden flex flex-col">
              <div className="px-5 py-4 bg-slate-700/30 border-b border-slate-700/50 flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg></div><h2 className="text-lg font-semibold text-white">Umieszczone słowa</h2></div><span className="px-3 py-1 rounded-full text-xs font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30">{placedWords.length}/{allPlacedWords.length} słów</span></div>
              <div className="p-5 flex-1 overflow-y-auto max-h-[219px]"><div className="flex flex-wrap gap-2">{sorted.map((pw, i) => { const isHidden = hiddenWords.has(pw.word); const isDisconnectedHidden = disconnectedHiddenWords.has(pw.word); return <button key={i} onClick={() => toggleWordVisibility(pw.word)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 border group ${isDisconnectedHidden ? 'bg-slate-800/50 text-slate-600 border-slate-700/30 cursor-not-allowed' : isHidden ? 'bg-slate-800/50 text-slate-500 border-slate-700/30 hover:bg-slate-700/50 hover:text-slate-400' : 'bg-slate-700/50 hover:bg-amber-500/20 text-slate-300 hover:text-amber-400 border-slate-600/30 hover:border-amber-500/30'}`} title={isDisconnectedHidden ? `"${pw.word}" – ukryte jako zależność` : isHidden ? `Przywróć "${pw.word}"` : `Ukryj "${pw.word}"`} disabled={isDisconnectedHidden}>{pw.word.toLowerCase()}{isHidden ? <svg className={`w-3.5 h-3.5 ${isDisconnectedHidden ? 'opacity-30' : 'opacity-50 group-hover:opacity-100'} transition-opacity`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}</button> })}</div></div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden flex flex-col">
              <div className="px-5 py-4 bg-slate-700/30 border-b border-slate-700/50 flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg></div><h2 className="text-lg font-semibold text-white">Opcje wyświetlania</h2></div>
              <div className="p-5 flex-1">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer group"><div className="relative"><input type="checkbox" checked={hideWords} onChange={(e) => handleHideWordsChange(e.target.checked)} className="peer sr-only" /><div className="w-11 h-6 bg-slate-600 rounded-full peer-checked:bg-amber-500 transition-all"></div><div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md peer-checked:translate-x-5 transition-all"></div></div><span className="text-sm text-slate-300 group-hover:text-white transition-colors">Ukryj słowa</span></label>
                    <label className={`flex items-center gap-3 ${!hideWords || revealedLetters.size > 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer group'}`}><div className="relative"><input type="checkbox" checked={indicateVowels} disabled={!hideWords || revealedLetters.size > 0} onChange={(e) => handleIndicateVowelsChange(e.target.checked)} className="peer sr-only" /><div className="w-11 h-6 bg-slate-600 rounded-full peer-checked:bg-cyan-500 transition-all peer-disabled:opacity-50"></div><div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md peer-checked:translate-x-5 transition-all"></div></div><span className="text-sm text-slate-300 group-hover:text-white transition-colors">Wskaż samogłoski</span></label>
                    <label className={`flex items-center gap-3 ${!hideWords || revealedLetters.size > 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer group'}`}><div className="relative"><input type="checkbox" checked={indicatePolishChars} disabled={!hideWords || revealedLetters.size > 0} onChange={(e) => handleIndicatePolishCharsChange(e.target.checked)} className="peer sr-only" /><div className="w-11 h-6 bg-slate-600 rounded-full peer-checked:bg-violet-500 transition-all peer-disabled:opacity-50"></div><div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md peer-checked:translate-x-5 transition-all"></div></div><span className="text-sm text-slate-300 group-hover:text-white transition-colors">Wskaż polskie znaki</span></label>
                    <div className="mt-4 pt-4 border-t border-slate-700/50">
                      <button onClick={rotateGrid} className="w-full px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg transition-all flex items-center justify-center gap-2 border border-slate-600/30"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Obróć</button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Ujawnij litery (Ctrl/Cmd + click)</label>
                    <select multiple disabled={!hideWords} value={[...revealedLetters]} onChange={handleRevealedLettersChange} className="size-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">{uniqueLetters.map(letter => <option key={letter} value={letter} className="py-1">{letter}</option>)}</select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {!isGenerating && grid && (
        <div className="pt-10 pb-5 crossword-bg flex flex-col gap-y-10">
          <div className="flex gap-2 ml-10">
            <div onClick={scrollToIterations} className="relative flex items-center justify-between gap-3 bg-slate-800 backdrop-blur-sm rounded-l-2xl rounded-r-lg border border-slate-700 shadow-xl p-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-blue-500 flex items-center justify-center"><svg className="size-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg></div>
              {isIterationBest(selectedIterationIndex) && <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg"><svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg></div>}
            </div>
            <div className="grid gap-1">
              <button onClick={prevIteration} className="px-3 bg-slate-800 opacity-30 hover:opacity-100 text-slate-300 hover:text-white rounded-lg rounded-tr-2xl transition-all flex items-center justify-center gap-2 border border-slate-700"><svg className="size-5 transition-transform duration-200 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>
              <button onClick={nextIteration} className="px-3 bg-slate-800 opacity-30 hover:opacity-100 text-slate-300 hover:text-white rounded-lg rounded-br-2xl transition-all flex items-center justify-center gap-2 border border-slate-700"><svg className="size-5 transition-transform duration-200 -rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>
            </div>
          </div>
          <div className="grid place-items-center px-10">{renderCrosswordSVG()}</div>
          <div className="flex justify-center mb-10"><button onClick={downloadSVG} className="px-6 py-3 bg-emerald-500 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all duration-200 flex items-center gap-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Pobierz SVG</button></div>
        </div>
      )}
    </div>
  )
}

export default GeneratorUI