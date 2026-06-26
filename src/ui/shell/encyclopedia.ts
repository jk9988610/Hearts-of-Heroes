/** 游戏百科：操作手册与概念解释 */

interface EncyclopediaSection {
  title: string
  subsections: { heading?: string; paragraphs?: string[]; list?: string[] }[]
}

const SECTIONS: EncyclopediaSection[] = [
  {
    title: '游戏目标',
    subsections: [
      {
        paragraphs: [
          '《三国雄心》是一款简化版大地图战略游戏。你操控魏、蜀、吴之一，通过占城、募兵、外交与国策，在粮尽之前统一关键城池。',
        ],
        list: [
          '胜利：占领 6 座关键城池',
          '失败：都城失守，或粮草耗尽连续 5 天',
        ],
      },
    ],
  },
  {
    title: '时间与速度',
    subsections: [
      {
        paragraphs: [
          '游戏以「游戏小时」为基本单位推进。×1 速度下，约 1 真实秒 = 1 游戏小时。',
          '顶栏显示「第 N 天 HH 时」，可暂停或切换 ×1 / ×2 / ×5。空格键也可暂停/继续。',
        ],
        list: [
          '行军：每段路径默认 48 游戏小时（2 天）',
          '战斗：默认 72 游戏小时（3 天）',
          '残编千人队（不足 500 人）行军时间 +20%',
        ],
      },
    ],
  },
  {
    title: '地图与图层',
    subsections: [
      {
        heading: '三层地图',
        list: [
          '军情：显示军棋、路径、城市名与战斗信息（主要操作层）',
          '地形：显示原野 / 山地 / 河畔类型',
          '资源：显示每格粮食产出（粮 X/日）',
        ],
      },
      {
        heading: '城市名称',
        paragraphs: [
          '地图上仅显示关键城池名称，分三级优先级：超大城市 → 大城市 → 小城市。缩放越远，显示的城市越少；同一优先级会同时显示。',
        ],
      },
      {
        heading: '视口操作',
        list: [
          '滚轮 / 双指：以光标为中心缩放',
          '拖拽：平移地图',
          '小地图点击：跳转视口',
        ],
      },
    ],
  },
  {
    title: '地图操作',
    subsections: [
      {
        heading: '选中',
        list: [
          '短按军棋：选中该千人队',
          '短按地块：选中地块，左侧面板显示详情',
          '军棋与地块选中互斥',
        ],
      },
      {
        heading: '移动',
        paragraphs: [
          '先在军情图层选中己方军棋，再右键或长按目标格，军队将沿相邻格自动寻路（BFS），绿色线段显示完整路径，逐段行军。',
          '行军倒计时期间军棋留在出发格，显示「→Nh」；倒计时结束后才进入下一格。和平时不可进入敌国领土，需先宣战。',
        ],
      },
      {
        heading: '外交',
        paragraphs: [
          '右键或长按他国（魏/蜀/吴）领土，弹出互动窗口：宣战 / 停战。',
        ],
        list: [
          '交战状态：停战可点，宣战不可点',
          '和平状态：宣战可点，停战不可点',
          '新局默认各国互相交战',
        ],
      },
    ],
  },
  {
    title: '编制体系',
    subsections: [
      {
        paragraphs: ['从大到小：集团军 → 将军队 → 千人队 → 百人队。'],
        list: [
          '百人队：组成单位，满编 100 人，不单独移动',
          '千人队：最小可移动单位，大地图显示为军棋，自动番号（1 队、2 队…）',
          '将军队：辖最多 10 个千人队，可任命将军，显示军旗汇总',
          '集团军：手动组建，辖多个将军队，可任命元帅，提供战役加成',
        ],
      },
      {
        heading: '将领栏（底栏）',
        list: [
          '短按待命将军队：打开详情，可任命将军、查看编队',
          '长按待命按钮 + 已选地图军棋：编入该将军队',
          '「新编军队」：创建待命将军队（固定最右）',
          '选中多个待命将军队时，「组建集团军」出现在最左',
          '选中将军队/集团军时，上方出现训练、驻守筑壕、取消行军',
        ],
      },
    ],
  },
  {
    title: '军棋说明',
    subsections: [
      {
        heading: '立场颜色',
        list: [
          '绿色：己方',
          '蓝色：盟国（停战/和平）',
          '灰色：中立',
          '红色：敌方',
        ],
      },
      {
        heading: '军棋结构',
        paragraphs: [
          '军棋为固定尺寸的矩形 counter：左侧为兵种与国旗，中间为番号与兵力，右侧为组织度/装备条；实心右区表示驻守筑壕。',
          '缩小地图时，相邻同类军棋会聚合显示兵力；放大后恢复单个军棋。点击聚合军棋可展开编队列表。',
        ],
      },
    ],
  },
  {
    title: '战斗',
    subsections: [
      {
        paragraphs: [
          '行军抵达敌方驻军格时进入战斗。战斗持续约 72 游戏小时，期间双方不可移动。',
          '战损从接战百人队起向后扣除；百人队归零则溃散。攻克敌方关键城可改变归属。',
        ],
        list: [
          '地形：原野利于进攻，山地利于防守，河畔均衡',
          '将军加成：将军队任命的将领提供攻防加成',
          '国策「坚甲厉兵」可提升防御',
        ],
      },
    ],
  },
  {
    title: '经济与行动栏',
    subsections: [
      {
        heading: '粮食',
        list: [
          '每格按地形产出粮食（原野 2 / 河畔 1.5 / 山地 1，单位：粮/日）',
          '屯田可使产出 ×2（建设 10 粮）',
          '新占城池前 3 天产出减半',
          '所有百人队每小时消耗军粮；断粮会溃散并可能导致战败',
        ],
      },
      {
        heading: '行动栏按钮',
        list: [
          '建设：在选中己方地块建造屯田',
          '募兵：消耗 20 粮，为缺编百人队 +100 人',
          '科研 / 贸易 / 生产：系统筹备中',
        ],
      },
    ],
  },
  {
    title: '国家面板（顶栏国名）',
    subsections: [
      {
        list: [
          '国策：激活消耗粮食的永久加成（广开屯田、坚甲厉兵、急行军等）',
          '谋士团：7 个槽位，从谋士池任命（与将领独立）',
          '军官团：7 个槽位，从将领池任命，不影响将领领兵',
        ],
      },
    ],
  },
  {
    title: '国策一览',
    subsections: [
      {
        list: [
          '广开屯田（30 粮）：粮食产出 ×1.5',
          '坚甲厉兵（40 粮，需广开屯田）：防御 ×1.2',
          '急行军（25 粮）：行军时间 ×0.5',
          '全面动员（50 粮，需急行军）：募兵折扣（筹备中）',
        ],
      },
    ],
  },
  {
    title: '存档与其他',
    subsections: [
      {
        list: [
          '存档 / 读档：本地浏览器 IndexedDB 保存',
          '新游戏：可覆盖旧档，需重新选择势力',
          '调试：开发者日志与状态快照',
          '日志：近期行军、战斗等事件摘要',
        ],
      },
    ],
  },
]

export function renderEncyclopedia(container: HTMLElement): void {
  container.replaceChildren()

  const intro = document.createElement('p')
  intro.className = 'encyclopedia-intro'
  intro.textContent =
    '以下为当前版本的操作说明与核心概念。界面以军情图层为主进行指挥；遇敌、缺粮或外交变化时请留意顶栏提示与警报条。'
  container.appendChild(intro)

  for (const section of SECTIONS) {
    const sec = document.createElement('section')
    sec.className = 'encyclopedia-section'

    const h3 = document.createElement('h3')
    h3.textContent = section.title
    sec.appendChild(h3)

    for (const sub of section.subsections) {
      if (sub.heading) {
        const h4 = document.createElement('h4')
        h4.textContent = sub.heading
        sec.appendChild(h4)
      }
      for (const p of sub.paragraphs ?? []) {
        const el = document.createElement('p')
        el.textContent = p
        sec.appendChild(el)
      }
      if (sub.list?.length) {
        const ul = document.createElement('ul')
        for (const item of sub.list) {
          const li = document.createElement('li')
          li.textContent = item
          ul.appendChild(li)
        }
        sec.appendChild(ul)
      }
    }

    container.appendChild(sec)
  }
}
