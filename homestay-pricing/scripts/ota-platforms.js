/**
 * OTA 平台配置与 Extractor 定义 v3.3
 *
 * 基于 Browser Agent 实测 DOM 结构：
 *   - 携程：Taro 框架 span.taro-text + 文本语义过滤（v3.2 实测详情页房型/价格/剩余房量）
 *   - 美团：Vue H5 + hue-base-* CSS + 文本语义过滤（实测强制登录）
 *   - 飞猪：KISSY PC端 + .row-title/.comment-score/.pi-price（实测详情页需登录）
 *   - 去哪儿：消费者端 touch.qunar.com（海外IP重定向到首页，需国内网络实测校准）
 *   - 同程：Vue + li.hotelItem + div.name/.score/.price（实测列表页可用，价格需登录）
 *
 * 所有平台均仅需消费者端普通账号，无需商家后台。
 *
 * 房型数据统一字段：
 *   name           - 房型名称（如"高级大床房"）
 *   price          - 价格（如"¥368"，通常为活动价/卖价）
 *   originalPrice  - 原价/划线价（如"¥580"，无活动时为空）
 *   promotions     - 活动标签数组（如["连住优惠","早鸟价","新客立减"]）
 *   remainingRooms - 剩余房量（数字或null，null表示未显示/充足）
 *   roomCount      - 该竞品在售房型总数（从房型列表计算）
 *   area           - 面积（如"18-22㎡"）
 *   bed            - 床型（如"1张1.8米大床"）
 *   breakfast      - 早餐（如"无早餐"/"含早餐"）
 *   cancelPolicy   - 取消政策（如"入住当天18:00前可免费取消"）
 */

const OTA_PLATFORMS = {
  ctrip: {
    name: '携程',
    loginUrl: 'https://m.ctrip.com/html5/',
    listUrl: 'https://m.ctrip.com/webapp/hotel/hangzhou17/sl4191978',
    loginCheckText: '登录看低价',
    selectors: {
      roomListContainer: '#module-anchor-NormalRoomList',
      roomCard: '#module-anchor-NormalRoomList > div.xtaro-xview',
      textSpan: 'span.taro-text',
      viewDiv: 'div.xtaro-xview',
      hotelLink: 'a.xt-link',
    },
    extractors: {
      /**
       * 携程详情页房型数据提取（v3.2 - 基于实测 Taro DOM）
       *
       * DOM 结构（实测于全季酒店杭州西湖店 hotelId=453487）：
       *   #module-anchor-NormalRoomList
       *     > div.xtaro-xview (roomCard)
       *       内含多层嵌套 div.xtaro-xview，叶子节点为 span.taro-text 或 div.xtaro-xview
       *
       * 每个房型卡片的叶子文本节点按顺序包含：
       *   [图片数, 房型名称, 图标, 床型, 面积, 入住人数, 楼层, 窗户描述, 景观, 房间代码, 早餐, 取消政策, ...]
       *   [..., 立即确认, 至多N间, ¥, 价格数字, 品牌首单, 订, 在线付, 查看其他N个价格]
       */
      async extractRoomData(page) {
        return await page.evaluate(() => {
          const rooms = [];
          const roomList = document.querySelector('#module-anchor-NormalRoomList');
          if (!roomList) return rooms;

          // 获取所有房型卡片（直接子元素 div.xtaro-xview）
          const roomCards = roomList.querySelectorAll(':scope > div.xtaro-xview');

          roomCards.forEach(card => {
            // 提取所有叶子文本节点（递归遍历 DOM 树）
            const leaves = [];
            const walk = (el) => {
              if (el.children.length === 0) {
                const t = el.textContent.trim();
                if (t) leaves.push(t);
              } else {
                for (let i = 0; i < el.children.length; i++) walk(el.children[i]);
              }
            };
            walk(card);

            // 房型名称：包含"房"/"套房"/"大床"/"双床"/"标间"/"亲子"/"钟点"关键词
            const nameText = leaves.find(t =>
              (t.includes('房') || t.includes('套房') || t.includes('大床') ||
               t.includes('双床') || t.includes('标间') || t.includes('亲子') ||
               t.includes('钟点')) &&
              t.length > 1 && t.length < 40 &&
              !t.includes('入住') && !t.includes('退房') &&
              !t.includes('免费') && !t.includes('取消') &&
              !t.includes('早餐') && !t.includes('确认')
            ) || '';

            // 跳过非房型卡片（如"展开全部房型"按钮）
            if (!nameText) return;

            // 价格：查找 ¥ 符号后面紧跟的数字
            let price = '未获取到';
            for (let i = 0; i < leaves.length; i++) {
              if (leaves[i] === '¥' && i + 1 < leaves.length && /^\d+$/.test(leaves[i + 1])) {
                price = '¥' + leaves[i + 1];
                // 检查后面是否有"起"字
                if (i + 2 < leaves.length && leaves[i + 2] === '起') {
                  price += '起';
                }
                break;
              }
              // 也处理 ¥ 和数字合在一起的情况
              if (/^¥\d+/.test(leaves[i])) {
                price = leaves[i];
                break;
              }
            }

            // 剩余房量：携程通常在库存紧张时显示"仅剩X间"
            let remainingRooms = null;
            const remainingMatch = leaves.find(t => /仅剩\s*(\d+)\s*间/.test(t));
            if (remainingMatch) {
              const match = remainingMatch.match(/仅剩\s*(\d+)\s*间/);
              if (match) remainingRooms = parseInt(match[1], 10);
            }
            // "至多X间"是可订上限，非剩余房量，但可作为参考
            const maxBookMatch = leaves.find(t => /至多\s*(\d+)\s*间/.test(t));

            // 面积：包含"㎡"
            const area = leaves.find(t => t.includes('㎡')) || '';

            // 床型：包含"床"且不是房型名称本身
            const bed = leaves.find(t =>
              t.includes('床') && t.length < 30 &&
              t !== nameText && !t.includes('入住') &&
              !t.includes('房') || (t.includes('张') && t.includes('床'))
            ) || '';

            // 早餐：包含"早餐"
            const breakfast = leaves.find(t => t.includes('早餐')) || '';

            // 取消政策：包含“取消”
            const cancelPolicy = leaves.find(t =>
              t.includes('取消') && t.length > 3
            ) || '';

            // ── v3.3 新增：活动标签 + 原价/划线价 ──

            // 活动标签：携程详情页常见活动词
            //   “连住优惠” “早鸟价” “新客立减” “品牌首单” “满减” “限时特惠”
            //   “闪住” “优享价” “特价” “今日特价” “预付特惠” “连住特惠”
            const promotionKeywords = [
              '连住优惠', '连住特惠', '早鸟价', '新客立减', '品牌首单',
              '满减', '限时特惠', '闪住', '优享价', '特价', '今日特价',
              '预付特惠', '会员价', '钻石价', '金卡价', '银卡价',
              '大促', '秒杀', '团购', '特惠', '促销', '活动',
            ];
            const promotions = leaves.filter(t =>
              promotionKeywords.some(kw => t.includes(kw)) && t.length < 20
            );

            // 原价/划线价：携程在活动价上方通常显示划线原价
            //   叶子节点中可能出现“¥”开头的第二个价格（前一个为活动价）
            //   或者在房间卡片内出现 “原价¥580” 这样的文本
            let originalPrice = '';
            // 策略1：查找“原价”文本
            const originalPriceText = leaves.find(t =>
              t.includes('原价') || t.includes('划线价') || t.includes('门市价')
            );
            if (originalPriceText) {
              const priceMatch = originalPriceText.match(/¥(\d+)/);
              if (priceMatch) originalPrice = '¥' + priceMatch[1];
            }
            // 策略2：如果没有“原价”文本，查找所有¥价格，取第一个作为原价（如果有多个）
            if (!originalPrice) {
              const allPrices = [];
              for (let i = 0; i < leaves.length; i++) {
                if (leaves[i] === '¥' && i + 1 < leaves.length && /^\d+$/.test(leaves[i + 1])) {
                  allPrices.push('¥' + leaves[i + 1]);
                }
                if (/^¥\d+/.test(leaves[i])) {
                  allPrices.push(leaves[i]);
                }
              }
              // 如果有2个以上价格，第一个通常是原价/划线价
              if (allPrices.length >= 2) {
                originalPrice = allPrices[0];
              }
            }

            rooms.push({
              name: nameText,
              price: price,
              originalPrice: originalPrice,
              promotions: promotions,
              remainingRooms: remainingRooms,
              maxBooking: maxBookMatch ? parseInt(maxBookMatch.match(/(\d+)/)[1], 10) : null,
              roomCount: 0, // 由外部填充房型总数
              area: area,
              bed: bed,
              breakfast: breakfast,
              cancelPolicy: cancelPolicy,
            });
          });

          return rooms;
        });
      },
      async extractHotelInfo(page) {
        return await page.evaluate(() => {
          const hotelLink = document.querySelector('a.xt-link');
          const hotelName = hotelLink?.textContent.trim() || '';

          let rating = '';
          let reviewCount = '';
          const allViewDivs = document.querySelectorAll('div.xtaro-xview');
          for (const div of allViewDivs) {
            const text = div.textContent.trim();
            if (/^\d\.\d$/.test(text)) { rating = text; break; }
          }

          const allSpans = document.querySelectorAll('span.taro-text');
          for (const span of allSpans) {
            const text = span.textContent.trim();
            if (text.includes('点评') && text.length < 50) { reviewCount = text; break; }
          }

          // ── v3.3 新增：酒店级活动标签 ──
          // 携程详情页顶部常见酒店级活动标签
          const hotelPromotions = [];
          const promoSpans = document.querySelectorAll('span.taro-text');
          const hotelPromoKeywords = ['满减', '连住', '新客', '会员', '限时', '特惠', '大促', '闪住', '早鸟', '预付'];
          promoSpans.forEach(span => {
            const t = span.textContent.trim();
            if (hotelPromoKeywords.some(kw => t.includes(kw)) && t.length < 30 && t.length > 1) {
              hotelPromotions.push(t);
            }
          });

          const needsLogin = Array.from(allSpans).some(
            el => el.textContent.trim() === '登录看低价'
          );

          return { hotelName, rating, reviewCount, hotelPromotions, needsLogin };
        });
      }
    }
  },

  meituan: {
    name: '美团',
    // 实测发现：美团酒店页面强制登录，loginUrl 指向美团登录页
    loginUrl: 'https://passport.meituan.com/useraccount/ilogin',
    listUrl: 'https://i.meituan.com/awp/h5/hotel/search/search.html',
    loginCheckText: '登录后查看',
    selectors: {
      // 美团 H5 使用 Vue + hue-base-* CSS 前缀
      // 详情页 URL: i.meituan.com/awp/h5/hotel/detail/detail.html?hotelId=XXX
      textSpan: 'span, p, div',
    },
    extractors: {
      // 美团详情页数据提取（基于实测 Vue H5 DOM + 文本语义过滤）
      // 美团酒店页面强制要求登录，未登录会跳转 passport.meituan.com
      // 登录后详情页可见房型价格列表
      async extractRoomData(page) {
        return await page.evaluate(() => {
          const rooms = [];

          // 先检查是否被重定向到登录页
          const currentUrl = window.location.href;
          if (currentUrl.includes('passport.meituan.com') || currentUrl.includes('ilogin')) {
            return { rooms, needsLogin: true, note: '页面被重定向到登录页' };
          }

          // 通用文本语义提取（类似携程的过滤策略，适配美团Vue框架）
          const allElements = Array.from(document.querySelectorAll('span, p, div, h1, h2, h3, h4, h5'));
          const leafTexts = allElements.filter(el => {
            return el.children.length === 0 ||
                   Array.from(el.children).every(c => c.children.length === 0);
          });

          // 找房型名称：包含"房"/"套房"/"大床"/"标间"/"亲子"/"榻榻米"且文本4-30字
          const roomNameCandidates = leafTexts.filter(el => {
            const t = el.textContent.trim();
            return (t.includes('房') || t.includes('套房') || t.includes('大床') ||
                    t.includes('标间') || t.includes('亲子') || t.includes('榻榻米'))
                   && t.length > 3 && t.length < 30
                   && !t.includes('入住') && !t.includes('退房') && !t.includes('满房')
                   && !t.includes('免费') && !t.includes('取消');
          });

          // 找价格：包含¥且文本<20字的叶子节点
          const priceCandidates = leafTexts.filter(el => {
            const t = el.textContent.trim();
            return t.includes('¥') && t.length < 20;
          }).map(el => el.textContent.trim());

          // 找登录提示
          const needsLoginTexts = leafTexts.filter(el => {
            const t = el.textContent.trim();
            return t.includes('登录后查看') || t.includes('登录查看') || t.includes('登录看价');
          });

          if (needsLoginTexts.length > 0) {
            return { rooms, needsLogin: true, note: '检测到登录提示文字' };
          }

          // ── v3.3 新增：美团活动标签 + 原价/划线价 ──
          // 美团 H5 常见活动标签关键词
          const meituanPromoKeywords = [
            '限时抢', '秒杀', '特价', '闪住', '连住优惠', '新客立减',
            '满减', '红包', '优惠', '折扣', '立减', '特惠',
            '早鸟', '预付特惠', '团购价', '会员价', '促销',
          ];

          // 查找酒店级活动标签（房型列表上方的区域）
          const hotelPromotions = leafTexts.filter(el => {
            const t = el.textContent.trim();
            return meituanPromoKeywords.some(kw => t.includes(kw))
                   && t.length < 30 && t.length > 1
                   && !t.includes('¥'); // 排除价格文本
          }).map(el => el.textContent.trim());

          // 组装房型数据（房型名按顺序对齐价格）
          for (let i = 0; i < roomNameCandidates.length; i++) {
            // 剩余房量
            let remainingRooms = null;
            const nameText = roomNameCandidates[i].textContent.trim();
            const nearbyTexts = leafTexts.slice(
              leafTexts.indexOf(roomNameCandidates[i]),
              leafTexts.indexOf(roomNameCandidates[i]) + 10
            ).map(el => el.textContent.trim());
            for (const t of nearbyTexts) {
              const match = t.match(/仅剩\s*(\d+)\s*间|剩余\s*(\d+)\s*间/);
              if (match) { remainingRooms = parseInt(match[1] || match[2], 10); break; }
            }

            // 房型级活动标签：在每个房型附近的文本中查找
            const roomPromotions = nearbyTexts.filter(t =>
              meituanPromoKeywords.some(kw => t.includes(kw)) && t.length < 20
            );

            // 原价/划线价：美团 H5 用 del 标签或 hue-base-price-line-through 表示划线价
            let originalPrice = '';
            // 策略1：查找 nearby 文本中的划线价（通常在活动价之前）
            const nearbyPrices = nearbyTexts.filter(t => /¥\d+/.test(t));
            if (nearbyPrices.length >= 2) {
              originalPrice = nearbyPrices[0]; // 第一个为原价
            }
            // 策略2：查找 del 标签中的划线价
            if (!originalPrice) {
              const delEls = roomNameCandidates[i].parentElement?.querySelectorAll('del, s, [class*="line-through"]');
              if (delEls && delEls.length > 0) {
                const delText = delEls[0].textContent.trim();
                const delMatch = delText.match(/¥(\d+)/);
                if (delMatch) originalPrice = '¥' + delMatch[1];
              }
            }

            // ── v3.4 新增：美团房型详情字段提取（area/bed/breakfast/cancelPolicy）──
            // 从 nearbyTexts 中按语义匹配提取，与携程提取器策略一致
            const roomArea = nearbyTexts.find(t => t.includes('㎡') && t.length < 15) || '';
            const roomBed = nearbyTexts.find(t =>
              (t.includes('张') && t.includes('床') && t.length < 25) ||
              (t.includes('大床') && t.length < 10) ||
              (t.includes('双床') && t.length < 10)
            ) || '';
            const roomBreakfast = nearbyTexts.find(t =>
              t.includes('早餐') && t.length < 20
            ) || '';
            const roomCancel = nearbyTexts.find(t =>
              (t.includes('取消') || t.includes('退款')) && t.length > 3 && t.length < 50
            ) || '';

            rooms.push({
              name: nameText,
              price: priceCandidates[i] || '未获取到',
              originalPrice: originalPrice,
              promotions: roomPromotions.length > 0 ? roomPromotions : hotelPromotions.slice(0, 2),
              remainingRooms: remainingRooms,
              roomCount: 0,       // 由外部填充房型总数
              area: roomArea,
              bed: roomBed,
              breakfast: roomBreakfast,
              cancelPolicy: roomCancel,
            });
          }

          return rooms;
        });
      },
      async extractHotelInfo(page) {
        return await page.evaluate(() => {
          // 检查是否被重定向到登录页
          const currentUrl = window.location.href;
          if (currentUrl.includes('passport.meituan.com') || currentUrl.includes('ilogin')) {
            return { hotelName: '', rating: '', reviewCount: '', needsLogin: true };
          }

          // 美团H5酒店名称通常在标题区域
          const titleSelectors = ['h1', 'h2', 'h3', '.hotel-name', '.poi-name', '[class*="title"]'];
          let hotelName = '';
          for (const sel of titleSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim().length > 2 && el.textContent.trim().length < 50) {
              hotelName = el.textContent.trim();
              break;
            }
          }

          // 评分：查找 \d.\d 格式或包含"分"的文本
          const allElements = Array.from(document.querySelectorAll('span, p, div'));
          let rating = '';
          let reviewCount = '';
          for (const el of allElements) {
            const t = el.textContent.trim();
            if (/^\d[\.\d]*分?$/.test(t) && t.length <= 5) {
              rating = t.replace('分', '');
              break;
            }
          }
          for (const el of allElements) {
            const t = el.textContent.trim();
            if (t.includes('评价') || t.includes('点评') || t.includes('条评论')) {
              reviewCount = t;
              break;
            }
          }

          // 登录检测：URL重定向 + 页面文字双重检测
          const needsLogin = currentUrl.includes('passport.meituan.com') ||
                             currentUrl.includes('ilogin') ||
                             allElements.some(el => {
                               const t = el.textContent.trim();
                               return t.includes('登录后查看') || t.includes('登录查看');
                             });

          return { hotelName, rating, reviewCount, needsLogin };
        });
      }
    }
  },

  fliggy: {
    name: '飞猪',
    // 实测发现：飞猪详情页需要淘宝账号登录
    // 列表页（hotel.fliggy.com/kezhan_list.htm）无需登录可访问
    // 详情页（hotel.fliggy.com/kezhan_detail2.htm?shid=XXX）必须登录
    loginUrl: 'https://login.taobao.com',
    listUrl: 'https://hotel.fliggy.com/kezhan_list.htm?city=330100&cityName=杭州',
    loginCheckText: '登录查看',
    selectors: {
      // 飞猪 PC端使用 KISSY 框架
      // 列表页选择器（实测）
      hotelNameLink: 'h5.row-title > a',
      ratingLink: 'a.comment-score',
      addressText: 'p.row-address',
      // 详情页选择器（登录后可见）
      priceElement: '.pi-price',
      roomContainer: '[class*="room"], [class*="sku"]',
    },
    extractors: {
      // 飞猪详情页数据提取（基于实测 KISSY PC端 DOM + 文本语义过滤）
      async extractRoomData(page) {
        return await page.evaluate(() => {
          const rooms = [];

          // 检查是否被重定向到登录页
          const currentUrl = window.location.href;
          if (currentUrl.includes('login.taobao.com') || currentUrl.includes('havanaone')) {
            return { rooms, needsLogin: true, note: '页面被重定向到淘宝登录页' };
          }

          // 飞猪详情页房型价格提取
          // 优先使用已知选择器 .pi-price
          const priceElements = Array.from(document.querySelectorAll('.pi-price'));
          const priceValues = priceElements.map(el => el.textContent.trim());

          // 通用文本语义提取作为补充
          const allElements = Array.from(document.querySelectorAll('span, p, div, td, h1, h2, h3, h4, h5, li'));
          const leafTexts = allElements.filter(el => {
            return el.children.length === 0 ||
                   Array.from(el.children).every(c => c.children.length === 0);
          });

          // 找房型名称
          const roomNameCandidates = leafTexts.filter(el => {
            const t = el.textContent.trim();
            return (t.includes('房') || t.includes('套房') || t.includes('大床') ||
                    t.includes('标间') || t.includes('亲子') || t.includes('榻榻米'))
                   && t.length > 3 && t.length < 30
                   && !t.includes('入住') && !t.includes('退房')
                   && !t.includes('免费') && !t.includes('取消');
          });

          // 找登录提示
          const needsLoginTexts = leafTexts.filter(el => {
            const t = el.textContent.trim();
            return t.includes('登录查看') || t.includes('请登录') || t.includes('立即登录');
          });

          if (needsLoginTexts.length > 0) {
            return { rooms, needsLogin: true, note: '检测到登录提示文字' };
          }

          // ── v3.3 新增：飞猪活动标签 + 原价/划线价 ──
          // 飞猪详情页常见活动标签关键词
          const fliggyPromoKeywords = [
            '限时特惠', '连住优惠', '早鸟价', '新客立减', '满减',
            '闪住', '特价', '优惠券', '折扣', '促销', '活动',
            '超级会员', '飞猪价', '漏漏价', '今日特价', '预付特惠',
            '淘票票', '津贴', '猫超',
          ];

          // 查找酒店级活动标签
          const hotelPromotions = leafTexts.filter(el => {
            const t = el.textContent.trim();
            return fliggyPromoKeywords.some(kw => t.includes(kw))
                   && t.length < 30 && t.length > 1
                   && !t.includes('¥');
          }).map(el => el.textContent.trim());

          // 原价/划线价提取：飞猪 PC 端用 del 标签或 .pi-old-price 表示划线价
          const originalPriceElements = Array.from(document.querySelectorAll('.pi-old-price, .old-price, del.price, s.price, [class*="oldPrice"], [class*="line-through"]'));
          const originalPriceValues = originalPriceElements.map(el => {
            const t = el.textContent.trim();
            const m = t.match(/¥(\d+)/);
            return m ? '¥' + m[1] : '';
          }).filter(t => t);

          // 优先用 .pi-price 选择器获取价格
          if (priceValues.length > 0 && roomNameCandidates.length > 0) {
            for (let i = 0; i < roomNameCandidates.length; i++) {
              // 剩余房量检测
              let remainingRooms = null;
              const nameText = roomNameCandidates[i].textContent.trim();
              const nearbyStart = leafTexts.indexOf(roomNameCandidates[i]);
              const nearbyTexts = leafTexts.slice(nearbyStart, nearbyStart + 10).map(el => el.textContent.trim());
              for (const t of nearbyTexts) {
                const match = t.match(/仅剩\s*(\d+)\s*间|剩余\s*(\d+)\s*间/);
                if (match) { remainingRooms = parseInt(match[1] || match[2], 10); break; }
              }

              // 房型级活动标签
              const roomPromotions = nearbyTexts.filter(t =>
                fliggyPromoKeywords.some(kw => t.includes(kw)) && t.length < 20
              );

              // ── v3.4 新增：飞猪房型详情字段提取 ──
              const roomArea = nearbyTexts.find(t => t.includes('㎡') && t.length < 15) || '';
              const roomBed = nearbyTexts.find(t =>
                (t.includes('张') && t.includes('床') && t.length < 25) ||
                (t.includes('大床') && t.length < 10) ||
                (t.includes('双床') && t.length < 10)
              ) || '';
              const roomBreakfast = nearbyTexts.find(t => t.includes('早餐') && t.length < 20) || '';
              const roomCancel = nearbyTexts.find(t =>
                (t.includes('取消') || t.includes('退款')) && t.length > 3 && t.length < 50
              ) || '';

              rooms.push({
                name: nameText,
                price: priceValues[i] || '未获取到',
                originalPrice: originalPriceValues[i] || '',
                promotions: roomPromotions.length > 0 ? roomPromotions : hotelPromotions.slice(0, 2),
                remainingRooms: remainingRooms,
                roomCount: 0,
                area: roomArea,
                bed: roomBed,
                breakfast: roomBreakfast,
                cancelPolicy: roomCancel,
              });
            }
          } else {
            // 回退到通用价格提取
            const genericPriceCandidates = leafTexts.filter(el => {
              const t = el.textContent.trim();
              return t.includes('¥') && t.length < 20;
            }).map(el => el.textContent.trim());

            for (let i = 0; i < roomNameCandidates.length; i++) {
              let remainingRooms = null;
              const nameText = roomNameCandidates[i].textContent.trim();
              const nearbyStart = leafTexts.indexOf(roomNameCandidates[i]);
              const nearbyTexts = leafTexts.slice(nearbyStart, nearbyStart + 10).map(el => el.textContent.trim());
              for (const t of nearbyTexts) {
                const match = t.match(/仅剩\s*(\d+)\s*间|剩余\s*(\d+)\s*间/);
                if (match) { remainingRooms = parseInt(match[1] || match[2], 10); break; }
              }

              // 房型级活动标签
              const roomPromotions = nearbyTexts.filter(t =>
                fliggyPromoKeywords.some(kw => t.includes(kw)) && t.length < 20
              );

              // ── v3.4 新增：飞猪通用回退路径房型详情字段提取 ──
              const roomArea = nearbyTexts.find(t => t.includes('㎡') && t.length < 15) || '';
              const roomBed = nearbyTexts.find(t =>
                (t.includes('张') && t.includes('床') && t.length < 25) ||
                (t.includes('大床') && t.length < 10)
              ) || '';
              const roomBreakfast = nearbyTexts.find(t => t.includes('早餐') && t.length < 20) || '';
              const roomCancel = nearbyTexts.find(t =>
                (t.includes('取消') || t.includes('退款')) && t.length > 3 && t.length < 50
              ) || '';

              rooms.push({
                name: nameText,
                price: genericPriceCandidates[i] || '未获取到',
                originalPrice: originalPriceValues[i] || '',
                promotions: roomPromotions.length > 0 ? roomPromotions : hotelPromotions.slice(0, 2),
                remainingRooms: remainingRooms,
                roomCount: 0,
                area: roomArea,
                bed: roomBed,
                breakfast: roomBreakfast,
                cancelPolicy: roomCancel,
              });
            }
          }

          return rooms;
        });
      },
      async extractHotelInfo(page) {
        return await page.evaluate(() => {
          // 检查是否被重定向到登录页
          const currentUrl = window.location.href;
          if (currentUrl.includes('login.taobao.com') || currentUrl.includes('havanaone')) {
            return { hotelName: '', rating: '', reviewCount: '', needsLogin: true };
          }

          // 飞猪详情页酒店信息提取
          // 优先用已知选择器
          const titleEl = document.querySelector('h1, h2, h3, .row-title > a, [class*="title"]');
          let hotelName = '';
          if (titleEl) {
            hotelName = titleEl.textContent.trim();
          }

          // 评分
          const ratingEl = document.querySelector('.comment-score, [class*="score"], [class*="rating"]');
          let rating = '';
          let reviewCount = '';
          if (ratingEl) {
            const rText = ratingEl.textContent.trim();
            const match = rText.match(/(\d[\.\d]*)分/);
            if (match) rating = match[1];
          }

          // 通用搜索补充
          if (!hotelName || !rating) {
            const allElements = Array.from(document.querySelectorAll('span, p, div, a'));
            for (const el of allElements) {
              const t = el.textContent.trim();
              if (!hotelName && t.length > 2 && t.length < 50 &&
                  (el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'H3')) {
                hotelName = t;
              }
              if (!rating && /^\d[\.\d]*分?$/.test(t) && t.length <= 5) {
                rating = t.replace('分', '');
              }
              if (!reviewCount && (t.includes('评价') || t.includes('条评论') || t.includes('点评'))) {
                reviewCount = t;
              }
            }
          }

          // 登录检测：URL重定向 + 页面文字双重检测
          const needsLogin = currentUrl.includes('login.taobao.com') ||
                             currentUrl.includes('havanaone') ||
                             currentUrl.includes('_____tmd_____') ||
                             document.body.innerText.includes('请登录') ||
                             document.body.innerText.includes('登录查看');

          return { hotelName, rating, reviewCount, needsLogin };
        });
      }
    }
  },

  qunar: {
    name: '去哪儿',
    loginUrl: 'https://m.qunar.com/',
    // 去哪儿消费者端酒店详情页 URL 模板
    // touch.qunar.com/hotelcn/{city}/hoteldetail?hotelId={hotelId}
    listUrl: 'https://touch.qunar.com/hotelcn/hangzhou?cityUrl=hangzhou',
    loginCheckText: '登录',
    selectors: {
      // 去哪儿移动端酒店详情页（通用选择器，需国内网络实测校准）
      // 注意：海外IP访问去哪儿酒店页面会被重定向到 www.qunar.com 首页
      roomListContainer: '.room-list, .room-wrap, [class*="roomList"], [class*="RoomList"]',
      roomItem: '.room-item, .room-card, [class*="roomItem"], [class*="RoomItem"]',
      hotelName: '.hotel-name, .title, [class*="hotelName"], h1',
      price: '.price, [class*="price"], [class*="Price"]',
      score: '.score, [class*="score"], [class*="comment"]',
    },
    extractors: {
      /**
       * 去哪儿详情页数据提取（v3.2 - 健壮的通用提取器）
       *
       * ⚠️ 限制说明：
       *   去哪儿消费者端（touch.qunar.com）在海外 IP 环境下会将所有酒店页面
       *   重定向到 www.qunar.com 首页，无法访问酒店详情页。
       *   需在国内网络环境下实测校准 DOM 选择器。
       *
       * 提取策略：
       *   1. 检测重定向（URL 包含 qunar.com 但无 hotel/touch 关键词）
       *   2. 优先使用已知选择器（.room-item 等）
       *   3. 回退到通用叶子节点文本语义提取
       *   4. 剩余房量：匹配"仅剩X间"/"剩余X间"/"X间可订"
       */
      async extractRoomData(page) {
        return await page.evaluate(() => {
          const rooms = [];

          // ── Step 1: 检测重定向 ──
          const currentUrl = window.location.href;
          if (currentUrl === 'https://www.qunar.com/' ||
              (currentUrl.includes('qunar.com') &&
               !currentUrl.includes('hotel') &&
               !currentUrl.includes('touch'))) {
            return {
              rooms: [],
              needsLogin: true,
              note: '页面被重定向到去哪儿首页（反爬/海外IP限制），需国内网络访问'
            };
          }

          // ── Step 2: 尝试已知选择器 ──
          const roomItems = document.querySelectorAll(
            '.room-item, .room-card, [class*="roomItem"], [class*="RoomItem"], [class*="roomCard"]'
          );

          if (roomItems.length > 0) {
            roomItems.forEach(item => {
              const leaves = [];
              const walk = (el) => {
                if (el.children.length === 0) {
                  const t = el.textContent.trim();
                  if (t) leaves.push(t);
                } else {
                  for (let i = 0; i < el.children.length; i++) walk(el.children[i]);
                }
              };
              walk(item);

              const nameText = leaves.find(t =>
                (t.includes('房') || t.includes('套房') || t.includes('大床') ||
                 t.includes('双床') || t.includes('标间') || t.includes('亲子')) &&
                t.length > 1 && t.length < 40 &&
                !t.includes('入住') && !t.includes('退房') && !t.includes('取消')
              ) || '';

              if (!nameText) return;

              // 价格
              let price = '未获取到';
              const priceEl = item.querySelector('.price, [class*="price"], [class*="Price"]');
              if (priceEl) {
                price = priceEl.textContent.trim();
              } else {
                const priceText = leaves.find(t => /¥|￥/.test(t) && t.length < 15);
                if (priceText) price = priceText;
                else {
                  const numPrice = leaves.find(t => /^\d{2,4}$/.test(t));
                  if (numPrice) price = '¥' + numPrice;
                }
              }

              // 剩余房量
              let remainingRooms = null;
              const remainingText = leaves.find(t =>
                /仅剩\s*(\d+)\s*间|剩余\s*(\d+)\s*间|(\d+)\s*间可订/.test(t)
              );
              if (remainingText) {
                const match = remainingText.match(/(\d+)\s*间/);
                if (match) remainingRooms = parseInt(match[1], 10);
              }

              rooms.push({
                name: nameText,
                price: price,
                originalPrice: '',
                promotions: [],  // 去哪儿需国内网络实测校准活动标签DOM
                remainingRooms: remainingRooms,
                roomCount: 0,
                area: leaves.find(t => t.includes('㎡')) || '',
                bed: leaves.find(t => t.includes('张') && t.includes('床') && t.length < 30) || '',
                breakfast: leaves.find(t => t.includes('早餐')) || '',
                cancelPolicy: leaves.find(t => t.includes('取消') && t.length > 3) || '',
              });
            });

            if (rooms.length > 0) return rooms;
          }

          // ── Step 3: 通用叶子节点文本语义提取（回退方案）──
          const allElements = Array.from(
            document.querySelectorAll('span, p, div, h1, h2, h3, h4, h5, li, td, em, strong')
          );
          const leafTexts = [];
          allElements.forEach(el => {
            if (el.children.length === 0 ||
                Array.from(el.children).every(c => c.children.length === 0)) {
              const t = el.textContent.trim();
              if (t && t.length < 60) leafTexts.push(t);
            }
          });

          // 检测登录提示
          const needsLogin = leafTexts.some(t =>
            t.includes('登录查看') || t.includes('请登录') || t.includes('去登录')
          );
          if (needsLogin) {
            return { rooms: [], needsLogin: true, note: '检测到登录提示文字' };
          }

          // 房型名称过滤
          const roomNameCandidates = leafTexts.filter(t =>
            (t.includes('房') || t.includes('套房') || t.includes('大床') ||
             t.includes('标间') || t.includes('亲子')) &&
            t.length > 3 && t.length < 30 &&
            !t.includes('入住') && !t.includes('退房') &&
            !t.includes('免费') && !t.includes('取消') &&
            !t.includes('预订') && !t.includes('订房')
          );

          // 价格
          const priceCandidates = leafTexts.filter(t =>
            (t.includes('¥') || t.includes('￥')) && t.length < 15
          );

          // 剩余房量
          const remainingCandidates = leafTexts.filter(t =>
            /仅剩\s*\d+\s*间|剩余\s*\d+\s*间|\d+\s*间可订/.test(t)
          );

          // 面积
          const areaCandidates = leafTexts.filter(t => t.includes('㎡'));

          // 床型
          const bedCandidates = leafTexts.filter(t =>
            t.includes('张') && t.includes('床') && t.length < 25
          );

          // 早餐
          const breakfastCandidates = leafTexts.filter(t => t.includes('早餐'));

          // 取消政策
          const cancelCandidates = leafTexts.filter(t =>
            t.includes('取消') && t.length > 3
          );

          // ── v3.3 新增：去哪儿活动标签 ──
          const qunarPromoKeywords = [
            '限时抢', '特价', '秒杀', '连住', '早鸟', '新客',
            '满减', '优惠券', '立减', '折扣', '特惠', '促销',
            '预付', '团购', '会员价',
          ];
          const hotelPromotions = leafTexts.filter(t =>
            qunarPromoKeywords.some(kw => t.includes(kw)) && t.length < 20
          );

          for (let i = 0; i < roomNameCandidates.length; i++) {
            let remainingRooms = null;
            if (remainingCandidates[i]) {
              const match = remainingCandidates[i].match(/(\d+)\s*间/);
              if (match) remainingRooms = parseInt(match[1], 10);
            }

            rooms.push({
              name: roomNameCandidates[i],
              price: priceCandidates[i] || '未获取到',
              originalPrice: '',
              promotions: hotelPromotions.length > 0 ? hotelPromotions.slice(0, 3) : [],
              remainingRooms: remainingRooms,
              roomCount: 0,
              area: areaCandidates[i] || '',
              bed: bedCandidates[i] || '',
              breakfast: breakfastCandidates[i] || '',
              cancelPolicy: cancelCandidates[i] || '',
            });
          }

          return rooms;
        });
      },
      async extractHotelInfo(page) {
        return await page.evaluate(() => {
          const currentUrl = window.location.href;
          // 如果跳转到 qunar.com 首页（非酒店页面），视为被拦截
          if (currentUrl === 'https://www.qunar.com/' ||
              (currentUrl.includes('qunar.com') &&
               !currentUrl.includes('hotel') &&
               !currentUrl.includes('touch'))) {
            return {
              hotelName: '',
              rating: '',
              reviewCount: '',
              needsLogin: true,
              note: '海外IP被重定向，需国内网络访问'
            };
          }

          // 优先选择器
          const titleEl = document.querySelector('h1, h2, h3, .hotel-name, [class*="hotelName"]');
          let hotelName = titleEl ? titleEl.textContent.trim() : '';

          const allElements = Array.from(document.querySelectorAll('span, p, div, a, em'));
          let rating = '';
          let reviewCount = '';
          for (const el of allElements) {
            const t = el.textContent.trim();
            if (!rating && /^\d[\.\d]*分?$/.test(t) && t.length <= 5) {
              rating = t.replace('分', '');
            }
            if (!reviewCount && (t.includes('评价') || t.includes('条评论') || t.includes('点评'))) {
              reviewCount = t;
            }
          }

          const needsLogin = document.body.innerText.includes('请登录') ||
                             document.body.innerText.includes('登录查看');

          return { hotelName, rating, reviewCount, needsLogin };
        });
      }
    }
  },

  tongcheng: {
    name: '同程',
    loginUrl: 'https://www.ly.com/login',
    listUrl: 'https://www.ly.com/hotel',
    loginCheckText: '登录查看最低价',
    selectors: {
      // 同程 PC端酒店列表（实测 Vue + data-v 属性）
      hotelListContainer: 'ul.hotelList, .hotel-list',
      hotelItem: 'li.hotelItem',
      hotelName: 'div.name',
      price: 'span.price em, .price em',
      score: 'span.score',
      sparkle: 'span.sparkle',
      image: 'div.img img',
    },
    extractors: {
      // 同程列表页数据提取（基于实测 DOM：li.hotelItem > a > div.name/.info/.img）
      async extractRoomData(page) {
        return await page.evaluate(() => {
          const rooms = [];

          // 检查是否被重定向到登录页
          const currentUrl = window.location.href;
          if (currentUrl.includes('login') || currentUrl.includes('passport')) {
            return { rooms, needsLogin: true, note: '页面被重定向到登录页' };
          }

          // 同程列表页：li.hotelItem 包含酒店卡片信息
          const hotelItems = document.querySelectorAll('li.hotelItem');

          if (hotelItems.length === 0) {
            // 回退到通用文本提取
            const allElements = Array.from(document.querySelectorAll('span, p, div, h1, h2, h3, h4, h5, li'));
            const leafTexts = allElements.filter(el => {
              return el.children.length === 0 ||
                     Array.from(el.children).every(c => c.children.length === 0);
            });

            const roomNameCandidates = leafTexts.filter(el => {
              const t = el.textContent.trim();
              return (t.includes('房') || t.includes('套房') || t.includes('大床') ||
                      t.includes('标间')) &&
                     t.length > 3 && t.length < 40 &&
                     !t.includes('入住') && !t.includes('退房');
            });

            const priceCandidates = leafTexts.filter(el => {
              const t = el.textContent.trim();
              return (t.includes('¥') || t.includes('￥') || /^\d+$/.test(t)) && t.length < 15;
            }).map(el => el.textContent.trim());

            for (let i = 0; i < roomNameCandidates.length; i++) {
              let remainingRooms = null;
              const nearbyStart = leafTexts.indexOf(roomNameCandidates[i]);
              const nearbyTexts = leafTexts.slice(nearbyStart, nearbyStart + 10).map(el => el.textContent.trim());
              for (const t of nearbyTexts) {
                const match = t.match(/仅剩\s*(\d+)\s*间|剩余\s*(\d+)\s*间/);
                if (match) { remainingRooms = parseInt(match[1] || match[2], 10); break; }
              }

              // ── v3.4 新增：同程房型详情字段提取 ──
              const roomArea = nearbyTexts.find(t => t.includes('㎡') && t.length < 15) || '';
              const roomBed = nearbyTexts.find(t =>
                (t.includes('张') && t.includes('床') && t.length < 25) ||
                (t.includes('大床') && t.length < 10)
              ) || '';
              const roomBreakfast = nearbyTexts.find(t => t.includes('早餐') && t.length < 20) || '';
              const roomCancel = nearbyTexts.find(t =>
                (t.includes('取消') || t.includes('退款')) && t.length > 3 && t.length < 50
              ) || '';

              rooms.push({
                name: roomNameCandidates[i].textContent.trim(),
                price: priceCandidates[i] || '未获取到',
                originalPrice: '',
                promotions: [],  // 同程需实测校准活动标签DOM
                remainingRooms: remainingRooms,
                roomCount: 0,
                area: roomArea,
                bed: roomBed,
                breakfast: roomBreakfast,
                cancelPolicy: roomCancel,
              });
            }

            return rooms;
          }

          // 同程列表页的卡片展示的是酒店级别信息（非房型级别）
          // 将每个酒店作为一条记录返回
          hotelItems.forEach(item => {
            const nameEl = item.querySelector('div.name');
            const scoreEl = item.querySelector('span.score');
            const sparkleEl = item.querySelector('span.sparkle');
            const priceEl = item.querySelector('span.price em, .price em');
            const imgEl = item.querySelector('div.img img');

            // 剩余房量检测
            let remainingRooms = null;
            const itemText = item.textContent;
            const remainMatch = itemText.match(/仅剩\s*(\d+)\s*间|剩余\s*(\d+)\s*间/);
            if (remainMatch) {
              remainingRooms = parseInt(remainMatch[1] || remainMatch[2], 10);
            }

            rooms.push({
              name: nameEl?.textContent?.trim() || nameEl?.getAttribute('title') || '',
              price: priceEl?.textContent?.trim() || '登录查看最低价',
              originalPrice: '',
              promotions: [],  // 同程列表页无活动标签，详情页需登录后实测校准
              remainingRooms: remainingRooms,
              roomCount: 0,
              score: scoreEl?.textContent?.trim() || '',
              rating_label: sparkleEl?.textContent?.trim() || '',
              area: '',
              bed: '',
              breakfast: '',
              cancelPolicy: '',
              imageUrl: imgEl?.src || '',
            });
          });

          return rooms;
        });
      },
      async extractHotelInfo(page) {
        return await page.evaluate(() => {
          const currentUrl = window.location.href;
          if (currentUrl.includes('login') || currentUrl.includes('passport')) {
            return { hotelName: '', rating: '', reviewCount: '', needsLogin: true };
          }

          // 同程列表页标题
          const titleEl = document.querySelector('h1, h2, h3, [class*="title"]');
          let hotelName = '';
          if (titleEl) {
            hotelName = titleEl.textContent.trim();
          }

          const allElements = Array.from(document.querySelectorAll('span, p, div, a'));
          let rating = '';
          let reviewCount = '';
          for (const el of allElements) {
            const t = el.textContent.trim();
            if (!rating && /^\d[\.\d]*分?$/.test(t) && t.length <= 5) {
              rating = t.replace('分', '');
            }
            if (!reviewCount && (t.includes('评价') || t.includes('条评论') || t.includes('点评'))) {
              reviewCount = t;
            }
          }

          // 同程列表页本身不需要登录，但价格需要登录才能看到
          const needsLogin = document.body.innerText.includes('请登录') &&
                             !document.body.innerText.includes('酒店推荐');

          return { hotelName, rating, reviewCount, needsLogin };
        });
      }
    }
  }
};

module.exports = OTA_PLATFORMS;