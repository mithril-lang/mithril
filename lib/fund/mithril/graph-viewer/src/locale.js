export const messages={
 en:{
  'group.business':'Business & processes','group.product':'Products & services','group.organization':'Organization & governance','group.code':'Code & implementation','group.ontology':'Ontology','group.evidence':'Evidence & references',
  'lane.read':'Read graph','lane.update':'Update state','lane.control':'Control & review',
  overview:'Community Atlas',orbit:'Focus Orbits',flow:'Execution flow',river:'Execution history',
  tabOverview:'① Overview',tabOrbit:'④ Explore',tabFlow:'③ Workflow',tabRiver:'⑦ History',
  back:'← All groups',navigation:'Map design',canvas:'Graph visualization',
  notRun:'No record',notSelected:'No selection',flowEmptyNote:'Provide a recorded workflow to inspect its control flow.',flowEmpty:'Branches, joins and pauses appear when a workflow record is supplied.',
  flowCount:'{count} actors · step {step}',flowNote:'Workflow definition and record. {status} · Scroll horizontally to inspect the full flow.',cycle:'cycle',flowLegend:'Green: executed · Coral: selected step · Amber: saved next actor',
  riverEmptyNote:'Supply a computation record to replay its recorded steps.',riverEmpty:'Select a recorded step to explore execution history.',riverCount:'step {step} / {count}',riverWorkflow:'Recorded actor visits. Up to 12 actors and 32 steps are displayed. Select a step to inspect it.',riverPropagation:'Updates and message counts by synchronous step. Intermediate vertex values are not inferred.',active:'Active vertices',changed:'Changed vertices',messages:'Messages sent',
  overviewCount:'{shown} / {total} nodes',groupName:'Group',groupNote:'Up to 36 representatives in this group. Use the host application to inspect additional nodes.',overviewNote:'Groups use asserted types and source domains. Select a representative to explore its neighborhood.',groupOpen:'Open {label} · {count} nodes',groupMore:'+ {count} nodes · open group',
  orbitEmptyNote:'Select a center node from the overview or your host application.',orbitEmpty:'Select a node to reveal its relations.',orbitCount:'Neighbors {shown} / {total}',orbitNote:'Full-graph neighborhood · {first} immediate neighbors; {second} second-hop candidates through displayed neighbors · Up to 8 immediate and 12 second-hop nodes shown.'
 },
 ja:{
  'group.business':'業務・プロセス','group.product':'製品・サービス','group.organization':'組織・ガバナンス','group.code':'コード・実装','group.ontology':'オントロジー','group.evidence':'来歴・外部参照',
  'lane.read':'グラフを読む','lane.update':'状態を更新','lane.control':'制御・確認',overview:'コミュニティ・アトラス',orbit:'フォーカス・オービット',flow:'実行フロー',river:'実行履歴',tabOverview:'① 俯瞰',tabOrbit:'④ 歩く',tabFlow:'③ 実行フロー',tabRiver:'⑦ 履歴',back:'← 全グループ',navigation:'地図のデザイン',canvas:'投影図',
  notRun:'未実行',notSelected:'未選択',flowEmptyNote:'記録されたワークフローを渡すと制御フローを確認できます。',flowEmpty:'記録を渡すと、分岐・合流・中断の流れを表示します。',flowCount:'{count} 処理 · step {step}',flowNote:'状態付き実行の定義と記録。{status} · 横スクロールで全体を確認できます。',cycle:'循環',flowLegend:'緑：実行済み · コーラル：選択したステップ · 黄：保存された次の処理',
  riverEmptyNote:'計算記録を渡すと、記録されたステップを再生できます。',riverEmpty:'実行記録を選んで、時間の流れを辿ります。',riverCount:'step {step} / {count}',riverWorkflow:'記録された処理の実行。最大12処理・32ステップを表示。ステップを選んで辿れます。',riverPropagation:'同期ステップごとの更新・メッセージ数。頂点の途中の値は推定しません。',active:'実行した頂点',changed:'更新した頂点',messages:'送信メッセージ',
  overviewCount:'{shown} / {total} ノード',groupName:'グループ',groupNote:'このグループの代表36件まで。追加ノードはホストアプリで確認できます。',overviewNote:'型と所属によるグループ。代表ノードを選ぶと周辺を展開します。',groupOpen:'{label} · {count}件をひらく',groupMore:'+ {count} 件 · グループをひらく',orbitEmptyNote:'全体図かホストアプリから中心にするノードを選んでください。',orbitEmpty:'ノードを選ぶと、関係がここに広がります。',orbitCount:'隣接 {shown} / {total} 件',orbitNote:'全グラフの周辺を表示 · 1 hop {first} 件、選んだ隣接ノードの2 hop候補 {second} 件 · 表示は隣接8件・2 hop候補12件まで。'
 }
};
export function translator(locale='en'){
 if(!Object.hasOwn(messages,locale))throw new TypeError('supported locales: en, ja');
 return (key,values={})=>{if(!Object.hasOwn(messages[locale],key))throw new TypeError('unknown UI message: '+key);return messages[locale][key].replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??''));};
}
