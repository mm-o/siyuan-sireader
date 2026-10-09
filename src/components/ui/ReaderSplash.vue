<template>
  <Transition name="opening-splash">
    <div v-if="visible" class="reader-opening" :class="openingClass" :style="coverStyle">
      <div class="reader-opening__wash"></div>
      <div class="reader-opening__print"></div>

      <section class="reader-opening__stage">
        <div class="reader-opening__cover-stack" :class="{ 'has-cover': hasCover }">
          <div class="reader-opening__cover-echo reader-opening__cover-echo--one"></div>
          <div class="reader-opening__cover-echo reader-opening__cover-echo--two"></div>

          <div class="reader-opening__book-object">
            <div class="reader-opening__page-fan" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div class="reader-opening__cover-face">
              <div v-if="!hasCover" class="reader-opening__monogram">{{ monogram }}</div>
              <div class="reader-opening__cover-noise"></div>
              <div class="reader-opening__cover-type">
                <span>{{ phaseLabel }}</span>
                <strong>{{ format }}</strong>
              </div>
              <div class="reader-opening__cover-caption">
                <strong>{{ title }}</strong>
                <span v-if="author">{{ author }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="reader-opening__info">
          <div class="reader-opening__kicker">
            <i></i>
            <span>SiReader</span>
          </div>
          <h1 class="reader-opening__motto" :aria-label="phaseLabel">
            <svg class="reader-opening__motto-art" viewBox="0 0 184 620" role="img" aria-hidden="true">
              <defs>
                <path id="reader-opening-glyph-kai" d="M118.5 4.1L118.5 4.1Q125.3 3.0 132.0 11.3L132.0 11.3Q137.0 16.6 134.1 21.4L134.1 21.4Q133.1 23.8 132.8 27.8L132.8 27.8Q132.6 57.5 133.8 83.0L133.8 83.0Q134.7 98.9 136.6 109.7L136.6 109.7Q137.1 114.1 132.4 114.1L132.4 114.1Q129.8 114.0 127.6 112.0L127.6 112.0Q118.1 102.1 110.9 92.2L110.9 92.2Q109.4 90.9 110.0 88.2L110.0 88.2Q110.9 86.7 112.8 87.1L112.8 87.1Q114.2 87.6 115.3 88.5L115.3 88.5Q119.6 92.5 123.9 96.2L123.9 96.2Q125.8 97.6 125.6 95.6L125.6 95.6Q125.1 87.1 124.8 78.6L124.8 78.6Q124.6 76.7 122.6 76.5L122.6 76.5Q120.7 76.0 118.2 74.9L118.2 74.9Q114.1 72.3 109.4 71.8L109.4 71.8Q107.4 71.8 107.4 73.8L107.4 73.8Q106.9 93.1 107.5 100.8L107.5 100.8Q108.2 102.3 106.1 104.8L106.1 104.8Q104.8 106.0 102.4 105.0L102.4 105.0Q100.8 104.4 99.5 101.8L99.5 101.8Q97.9 99.0 97.2 96.9L97.2 96.9Q96.0 93.8 99.3 91.0L99.3 91.0L99.3 74.9Q99.3 72.9 96.8 73.3L96.8 73.3Q95.7 73.4 94.6 73.8L94.6 73.8Q92.7 74.1 92.0 76.6L92.0 76.6Q90.8 81.7 89.1 85.8L89.1 85.8Q85.5 94.9 74.6 100.8L74.6 100.8Q73.6 101.3 73.1 100.6L73.1 100.6Q73.0 99.2 74.1 97.2L74.1 97.2L79.7 87.3Q81.2 84.4 82.6 78.9L82.6 78.9Q82.9 77.0 80.5 77.8L80.5 77.8Q76.7 79.7 74.9 79.6L74.9 79.6Q72.7 79.8 70.1 79.2L70.1 79.2Q68.2 78.8 68.0 81.3L68.0 81.3Q67.7 87.7 67.8 94.3L67.8 94.3Q67.9 96.9 69.9 99.1L69.9 99.1Q73.7 103.6 73.0 107.4L73.0 107.4Q72.2 109.5 69.2 109.7L69.2 109.7Q65.0 109.8 62.6 105.2L62.6 105.2Q61.3 102.7 59.7 100.2L59.7 100.2Q58.6 99.0 57.3 98.4L57.3 98.4Q55.1 97.2 55.4 95.1L55.4 95.1Q55.6 92.5 58.2 91.4L58.2 91.4Q59.4 90.8 59.7 88.3L59.7 88.3Q61.9 63.6 61.4 35.6L61.4 35.6Q61.3 30.6 54.5 24.6L54.5 24.6Q52.2 22.1 54.6 22.6L54.6 22.6L59.6 23.7Q64.0 24.7 68.2 27.5L68.2 27.5Q70.0 29.4 72.5 28.0L72.5 28.0Q75.8 25.3 78.5 25.5L78.5 25.5Q79.4 25.8 79.7 23.4L79.7 23.4L80.0 21.0Q80.0 19.0 77.5 19.9L77.5 19.9L72.6 21.5Q70.0 22.6 67.7 23.1L67.7 23.1Q63.6 23.6 58.0 20.1L58.0 20.1Q55.5 19.0 58.2 18.3L58.2 18.3Q68.5 15.5 77.9 11.5L77.9 11.5Q80.6 10.2 82.1 9.9L82.1 9.9Q83.7 9.5 85.8 11.0L85.8 11.0Q88.3 12.4 90.6 15.1L90.6 15.1Q91.5 15.9 91.3 18.5L91.3 18.5Q90.9 21.0 90.6 21.2L90.6 21.2Q89.9 21.7 89.6 23.6L89.6 23.6Q89.0 26.3 88.1 29.1L88.1 29.1Q87.5 31.3 89.5 29.4L89.5 29.4L90.8 28.0Q92.7 26.5 94.7 27.1L94.7 27.1Q95.9 27.9 95.9 29.1Q95.9 30.3 95.1 31.6L95.1 31.6Q86.0 45.8 74.4 51.9L74.4 51.9Q72.5 52.7 74.9 52.5L74.9 52.5Q82.2 51.5 94.6 48.8L94.6 48.8Q100.0 47.8 104.5 45.8L104.5 45.8Q110.3 44.5 116.8 47.8L116.8 47.8Q119.8 49.8 118.2 52.4L118.2 52.4Q116.6 55.8 112.6 54.3L112.6 54.3L111.5 54.1L108.0 54.1Q105.5 54.6 107.5 55.4L107.5 55.4Q111.5 57.3 109.1 60.2L109.1 60.2Q108.3 61.5 107.9 62.8L107.9 62.8Q107.7 64.4 110.1 63.6L110.1 63.6Q114.1 62.8 119.8 66.6L119.8 66.6Q121.2 67.3 122.6 67.7L122.6 67.7Q124.4 68.2 124.4 65.8L124.4 65.8Q124.2 54.3 124.0 42.8L124.0 42.8Q124.0 40.8 123.4 41.0L123.4 41.0Q122.7 41.3 120.3 41.3L120.3 41.3Q112.8 41.5 105.5 43.8L105.5 43.8Q102.1 44.9 99.7 45.2L99.7 45.2Q96.0 45.5 91.3 43.6L91.3 43.6Q88.7 42.9 91.4 41.5L91.4 41.5Q94.7 39.9 98.3 38.5L98.3 38.5Q100.4 37.6 100.2 35.3L100.2 35.3Q100.0 25.2 98.3 18.3L98.3 18.3Q97.3 15.7 98.4 13.6L98.4 13.6Q99.4 11.6 97.9 10.8L97.9 10.8Q96.2 10.0 98.6 9.5L98.6 9.5Q100.8 9.1 101.3 8.3L101.3 8.3Q101.5 7.8 101.8 8.4L101.8 8.4Q101.9 8.8 104.3 8.3L104.3 8.3Q106.6 7.8 108.7 6.7L108.7 6.7Q113.2 4.7 118.5 4.1ZM121.0 11.8L121.0 11.8Q117.4 12.4 114.8 13.7L114.8 13.7Q110.7 16.3 105.2 14.3L105.2 14.3Q103.2 13.5 103.2 13.7L103.2 13.7Q103.5 14.5 104.1 15.2L104.1 15.2Q106.7 17.7 107.3 19.9L107.3 19.9Q107.7 21.8 110.1 21.4L110.1 21.4Q113.4 20.6 119.4 18.4L119.4 18.4Q121.0 18.4 122.3 18.7L122.3 18.7Q123.9 19.5 123.9 17.9L123.9 17.9L123.9 16.2Q123.9 14.2 123.7 13.5L123.7 13.5Q122.6 11.5 121.0 11.8ZM123.9 26.5L123.9 26.5Q123.9 24.7 121.9 26.0L121.9 26.0L110.9 31.1Q108.8 32.1 108.9 33.3L108.9 33.3Q108.9 34.6 111.5 33.9L111.5 33.9Q117.0 32.1 121.8 32.8L121.8 32.8Q124.0 33.5 124.0 31.6L124.0 31.6Q123.9 29.1 123.9 26.5ZM75.4 35.1L75.4 35.1L74.7 35.3L73.0 35.4Q70.9 35.4 70.1 37.7L70.1 37.7Q69.9 39.1 69.9 40.6L69.9 40.6Q69.8 42.6 70.5 43.4L70.5 43.4Q71.1 44.1 73.6 42.6L73.6 42.6L74.4 42.2Q76.7 40.7 77.2 38.6L77.2 38.6Q77.3 37.5 77.6 36.4L77.6 36.4Q78.0 34.4 75.4 35.1ZM75.3 59.0L71.1 56.4Q69.3 55.3 69.2 57.4L69.2 57.4L68.7 70.3Q68.5 72.3 71.1 71.7L71.1 71.7Q76.9 69.8 81.9 68.9L81.9 68.9Q83.9 68.4 84.2 65.9L84.2 65.9Q84.2 63.7 83.4 62.3L83.4 62.3Q82.6 60.2 80.2 60.6L80.2 60.6Q78.1 60.5 75.3 59.0L75.3 59.0ZM98.2 58.4L98.2 58.4Q96.5 56.5 94.4 56.9L94.4 56.9L90.9 57.8Q88.8 58.3 90.9 59.4L90.9 59.4Q94.0 61.1 93.9 64.8L93.9 64.8Q93.8 66.6 95.9 66.4L95.9 66.4Q96.3 66.1 97.1 66.1L97.1 66.1Q99.3 65.9 99.3 63.3L99.3 63.3Q99.9 60.4 98.2 58.4Z" />
                <path id="reader-opening-glyph-juan" d="M81.2 142L81.2 142Q83.6 142 84.9 143.5L84.9 143.5Q86.5 144.8 88.5 145.7L88.5 145.7Q91.6 147.5 91.5 151.5L91.5 151.5Q91.3 153.7 90.9 155.8L90.9 155.8Q90.5 158.0 93.0 157.3L93.0 157.3Q97.8 156.2 102.7 155.4L102.7 155.4Q103.4 155.3 103.9 154.9L103.9 154.9Q107.0 152.8 112.5 158.1L112.5 158.1Q115.9 160.9 115.6 163.0L115.6 163.0Q115.0 165.5 111.6 166.2L111.6 166.2Q102.9 166.9 89.2 174.1L89.2 174.1Q87.4 175.0 89.9 174.2Q92.4 173.5 94.9 172.9L94.9 172.9Q97.2 172.1 99.6 171.8L99.6 171.8Q102.1 171.7 104.8 172.8L104.8 172.8Q108.5 174.6 108.0 178.3L108.0 178.3Q106.9 181.6 102.7 182.5L102.7 182.5Q100.0 183.1 93.8 185.4L93.8 185.4Q92.0 186.1 94.2 186.8L94.2 186.8Q96.3 188.5 98.8 188.3L98.8 188.3Q101.2 188.3 103.3 187.3L103.3 187.3Q110.2 184.1 119.1 190.4L119.1 190.4Q121.2 191.3 124.0 192.1L124.0 192.1Q128.7 194.2 128.9 198.4L128.9 198.4Q129.4 201.3 125.6 201.8L125.6 201.8Q121.4 202.0 114.9 198.6L114.9 198.6Q110.1 195.6 103.8 195.5L103.8 195.5Q101.8 195.6 103.7 198.1L103.7 198.1Q111.9 209.1 117.0 212.6L117.0 212.6Q121.6 214.8 127.9 215.5L127.9 215.5Q137.2 217.3 145.2 223.8L145.2 223.8Q146.0 224.9 146.1 225.3L146.1 225.3Q146.4 226.0 145.2 226.4L145.2 226.4Q141.5 226.8 134.8 225.7L134.8 225.7Q129.6 225.2 124.6 224.8L124.6 224.8Q117.2 223.8 112.9 220.9L112.9 220.9Q109.7 217.9 106.4 214.1L106.4 214.1Q104.3 211.8 103.2 214.2L103.2 214.2Q102.1 216.1 101.0 219.2L101.0 219.2Q98.3 229.0 95.4 233.8L95.4 233.8Q94.0 236.0 91.9 236.3L91.9 236.3Q86.0 236.3 79.9 229.4L79.9 229.4Q78.5 227.1 77.8 229.6L77.8 229.6Q76.4 234.8 77.6 241.4L77.6 241.4Q78.1 244.1 81.0 245.9L81.0 245.9Q91.4 249.7 112.4 247.0L112.4 247.0Q114.4 246.6 113.7 244.0L113.7 244.0Q111.9 237.6 108.7 229.4L108.7 229.4Q108.4 228.1 108.1 226.9L108.1 226.9Q107.7 225.1 109.1 225.3L109.1 225.3Q110.1 225.7 111.7 227.1L111.7 227.1Q113.8 229.2 116.0 231.8L116.0 231.8Q120.4 237.1 122.8 241.5L122.8 241.5Q124.6 244.5 126.2 246.5L126.2 246.5Q126.9 247.7 127.2 249.1L127.2 249.1Q127.2 250.5 124.7 251.9L124.7 251.9Q119.6 253.6 105.0 255.2L105.0 255.2Q91.6 256.8 80.6 253.8L80.6 253.8Q70.7 250.2 68.9 241.3L68.9 241.3Q68 237.7 68.2 234.2L68.2 234.2Q69.1 227.1 70.3 220.1L70.3 220.1Q70.3 218.5 68.9 216.4Q67.4 214.4 65.4 216.7L65.4 216.7Q52.9 230.0 38.2 236.6L38.2 236.6L35.8 237.2Q33.3 237.2 33.1 236.9L33.1 236.9Q32.7 235.8 33.7 234.5L33.7 234.5Q34.4 233.3 35.6 232.1L35.6 232.1L45.5 224.1Q59.3 212.0 63.9 205.5L63.9 205.5Q65.8 203.0 63.6 203.8L63.6 203.8Q58.4 205.7 54.3 207.5L54.3 207.5Q52.0 208.7 50.0 209.1L50.0 209.1Q45.4 209.4 38.7 207.0L38.7 207.0L33.1 204.6Q30.6 203.6 33.1 203.0L33.1 203.0Q42.2 201.6 52.0 198.1L52.0 198.1Q60.4 195.5 69.5 193.4L69.5 193.4Q71.3 193.1 72.4 191.0L72.4 191.0Q72.7 190.4 73.0 189.6L73.0 189.6Q74.0 187.5 71.7 187.9L71.7 187.9Q66.0 188.9 58.9 188.0L58.9 188.0Q57.3 187.8 54.0 185.8L54.0 185.8Q51.5 184.5 49.7 182.7L49.7 182.7Q48.8 182.1 49.7 181.4L49.7 181.4Q52.4 180.9 57.3 181.9L57.3 181.9Q62.5 182.6 70.6 179.9L70.6 179.9Q72.8 179.3 72.8 179.0L72.8 179.0Q73.3 175.8 77.0 173.0L77.0 173.0Q79.0 171.7 79.1 171.2L79.1 171.2Q79.2 170.3 76.9 171.5L76.9 171.5Q72.2 174.0 69.7 176.1L69.7 176.1Q67.6 178.5 64.8 179.3L64.8 179.3Q61.7 179.9 60.5 176.9L60.5 176.9Q59.1 172.9 61.0 169.1L61.0 169.1Q61.4 168.2 63.2 166.9L63.2 166.9Q65.3 165.3 67.6 159.7L67.6 159.7L68.6 155.4Q69.2 153.1 70.7 155.5L70.7 155.5Q73.5 159.3 73.7 162.5L73.7 162.5Q73.4 164.5 75.6 163.5L75.6 163.5Q77.1 162.8 78.6 162.3L78.6 162.3Q80.6 161.4 80.8 159.0L80.8 159.0L81.0 153.4Q81.5 150.6 79.6 146.3L79.6 146.3Q79.0 145.7 79.3 143.8L79.3 143.8Q79.8 142.1 81.2 142ZM82.2 189.6L82.2 189.6Q81.4 189.6 81.2 190.2L81.2 190.2Q80.7 191.2 82.5 190.8L82.5 190.8Q84.6 190.5 83.8 190.0L83.8 190.0Q83.3 189.6 82.2 189.6ZM89.8 197.1L89.8 197.1L89.3 197.2Q84.0 198.2 78.8 199.5L78.8 199.5Q76.7 200.0 75.5 202.4L75.5 202.4L73.0 206.6Q71.7 208.7 74.2 208.2L74.2 208.2Q78.5 207.0 83.9 204.6L83.9 204.6Q90.5 202.2 96.2 203.3L96.2 203.3Q98.3 204.0 96.4 201.8L96.4 201.8Q95.1 200.1 93.8 198.4L93.8 198.4Q92.4 196.5 89.8 197.1ZM89.9 210.8L89.9 210.8L89.0 211.0Q86.6 211.8 84.1 213.0L84.1 213.0Q80.7 214.8 78.1 215.1L78.1 215.1Q76.1 215.1 78.6 217.1L78.6 217.1Q80.9 219.2 80.6 221.1L80.6 221.1Q80.3 222.2 82.4 223.3L82.4 223.3Q84.9 224.9 87.3 225.7L87.3 225.7Q89.3 226.4 90.3 223.8L90.3 223.8Q91.9 217.4 92.2 212.3L92.2 212.3Q92.4 210.0 89.9 210.8Z" />
                <path id="reader-opening-glyph-you" d="M87.7 280.6L87.7 280.6Q87.8 280.1 90.5 280L90.5 280Q95.7 281.2 100.4 283.4L100.4 283.4Q107.2 288.0 104.2 294.2L104.2 294.2L101.5 300.5Q100.6 302.5 102.7 302.3L102.7 302.3Q107.3 301.5 112.0 300.9L112.0 300.9Q119.2 300.2 121.7 299.6L121.7 299.6Q127.8 296.5 134.1 299.1L134.1 299.1Q140.6 302.6 143.9 303.6L143.9 303.6Q146.5 304.1 148.7 306.6L148.7 306.6Q152.6 310.9 148.5 313.8L148.5 313.8Q147.6 314.5 146.0 314.6L146.0 314.6Q141.7 314.5 136.2 310.8L136.2 310.8Q131.8 308.2 126.1 307.4L126.1 307.4Q114.2 307.3 98.3 310.4L98.3 310.4Q96.3 310.8 95.1 313.2L95.1 313.2Q92.4 318.1 89.4 323.3L89.4 323.3Q88.1 325.5 90.5 324.8L90.5 324.8Q95.2 323.6 100.1 321.7L100.1 321.7Q104.3 320.0 107.5 319.5L107.5 319.5Q112.4 319.9 117.1 325.8L117.1 325.8Q118.1 328.5 117.2 329.8Q116.4 331.2 116.4 332.7L116.4 332.7Q116.3 343.7 117.2 361.0L117.2 361.0Q118.6 381.6 116.5 391.6L116.5 391.6Q115.3 401.1 108.5 394.6L108.5 394.6Q106.9 392.0 104.8 389.6L104.8 389.6Q97.8 383.7 94.2 375.1L94.2 375.1Q93.5 373.4 94.9 373.1L94.9 373.1Q97.6 374.0 99.8 376.0L99.8 376.0Q102.8 378.3 105.9 380.4L105.9 380.4Q108.4 381.9 108.5 379.4L108.5 379.4L108.5 363.7Q108.5 361.3 107.4 362.2L107.4 362.2Q105.9 363.2 103.8 363.3L103.8 363.3Q101.4 363.7 98.9 364.3L98.9 364.3Q94.5 365.3 91.0 365.1L91.0 365.1Q88.8 365.1 88.8 367.5L88.8 367.5Q88.5 372.8 88.5 378.2L88.5 378.2Q88.2 381.4 90.8 384.2L90.8 384.2Q92.0 386.2 92.6 387.9L92.6 387.9Q93.4 391.0 90.3 392.1L90.3 392.1Q85.6 393.2 82.7 387.3L82.7 387.3Q81.1 384.0 79.3 382.6L79.3 382.6Q77.0 381.5 77.1 378.7L77.1 378.7Q77.0 377.7 78.4 376.2L78.4 376.2Q79.0 375.7 79.2 374.5L79.2 374.5Q82.2 360.0 81.9 340.9L81.9 340.9Q81.8 339.8 81.4 338.7L81.4 338.7Q80.6 336.7 78.6 339.2L78.6 339.2Q70.5 349.4 61.4 355.2L61.4 355.2Q58.8 357.0 57.7 356.9L57.7 356.9Q54.1 356.7 55.4 353.3L55.4 353.3Q55.8 352.1 56.5 351.6L56.5 351.6Q67.4 341.2 73.7 332.0L73.7 332.0Q75.4 329.6 75.3 329.0L75.3 329.0Q75.8 328.8 77.5 326.4L77.5 326.4Q80.9 321.5 84.1 315.3L84.1 315.3Q85.3 313.1 82.9 313.7L82.9 313.7Q68.0 317.5 58.6 321.8L58.6 321.8Q54.1 322.7 48.8 320.9L48.8 320.9Q45.6 319.6 40.5 317.3L40.5 317.3Q38.1 316.3 41.0 315.7L41.0 315.7Q52.2 313.7 60.6 311.0L60.6 311.0Q71.7 307.8 87.7 304.9L87.7 304.9Q89.7 304.5 90.8 302.0L90.8 302.0Q92.8 297.3 93.6 292.9L93.6 292.9Q94.1 289.2 92.9 287.3L92.9 287.3L88.7 282.7Q87.7 281.5 87.7 280.6ZM106.9 330.0L106.9 330.0Q106.3 328.2 104.3 328.8L104.3 328.8Q100.8 330.2 97.2 331.7L97.2 331.7Q93.0 333.2 86.9 331.1L86.9 331.1Q84.9 330.4 84.6 330.9L84.6 330.9Q84.3 331.4 86.7 332.8L86.7 332.8Q91.9 336.2 90.5 340.5L90.5 340.5Q90.1 342.5 92.5 342.0L92.5 342.0Q96.3 341.0 101.9 338.3L101.9 338.3Q103.5 337.5 105.7 337.8L105.7 337.8Q107.6 338.4 107.6 336.2L107.6 336.2Q107.5 332.5 106.9 330.0ZM108.3 353.7L108.1 346.9Q108.0 344.8 106.0 346.3L106.0 346.3Q97.6 351.1 94.5 352.5L94.5 352.5Q91.0 354.1 91.5 350.6L91.5 350.6Q91.9 349.4 90.8 349.4L90.8 349.4Q89.7 349.3 89.6 351.7L89.6 351.7L89.3 356.3Q89.2 358.3 91.7 357.5L91.7 357.5Q98.2 355.1 101.2 354.2L101.2 354.2Q103.6 354.0 106.3 355.1L106.3 355.1Q108.3 356.2 108.3 353.7L108.3 353.7Z" />
                <path id="reader-opening-glyph-yi" d="M75.1 424.3L76.9 420.6Q78.3 418.2 79.6 420.6L79.6 420.6Q82.2 424.2 80.6 428.3L80.6 428.3Q79.8 430.4 81.9 429.3L81.9 429.3Q93.0 423.8 103.5 420.3L103.5 420.3Q104.4 420.3 106.0 418.7L106.0 418.7Q106.5 418.2 107.2 418.1L107.2 418.1Q109.9 417.6 113.4 421.4L113.4 421.4Q118.4 426.5 113.0 429.3L113.0 429.3Q111.5 429.9 110.5 429.9L110.5 429.9Q109.9 430.1 109.3 430.6L109.3 430.6Q101.9 436.4 92.7 442.1L92.7 442.1Q90.5 443.4 93.0 442.9L93.0 442.9Q97.8 441.9 102.8 441.2L102.8 441.2Q106.1 440.7 107.7 439.8L107.7 439.8Q111.1 437.7 115.8 439.3L115.8 439.3Q118.1 440.8 120.7 440.9L120.7 440.9Q124.2 441.6 125.7 445.5L125.7 445.5Q125.9 447.6 123.6 448.9L123.6 448.9Q121.7 450.3 119.9 449.8L119.9 449.8Q114.2 448.4 107.8 449.1L107.8 449.1Q96.6 449.9 80.3 453.4L80.3 453.4Q78.2 453.9 80.6 455.0L80.6 455.0Q83.7 456.7 84.8 458.0L84.8 458.0Q85.5 459.3 85.3 460.3L85.3 460.3Q84.9 461.5 87.1 461.2L87.1 461.2Q97.8 460.4 106.7 457.2L106.7 457.2Q108.1 456.7 109.2 456.1L109.2 456.1Q114.2 453.0 119.0 455.7L119.0 455.7Q122.6 458.5 120.1 461.7L120.1 461.7Q119.1 462.8 117.7 463.3L117.7 463.3Q111.4 465.8 101.7 472.8L101.7 472.8Q100.4 473.7 99.2 473.8L99.2 473.8Q95.6 473.9 96.5 470.6L96.5 470.6Q96.7 469.7 97.8 468.5L97.8 468.5Q98.7 467.5 96.2 467.5L96.2 467.5Q92.1 467.5 86.9 463.5L86.9 463.5Q84.6 462.0 83.3 464.0L83.3 464.0Q72.1 481.7 55.3 486.6L55.3 486.6Q52.9 487.5 51.3 487.2L51.3 487.2Q50.7 486.6 52.1 485.0L52.1 485.0Q54.0 482.9 56.9 480.7L56.9 480.7Q68.7 472.1 74.3 461.0L74.3 461.0Q75.9 458.5 74.8 457.3L74.8 457.3Q73.4 455.0 71.4 455.6L71.4 455.6Q65.4 457.8 62.7 458.4L62.7 458.4Q56.7 458.7 50.1 453.5L50.1 453.5Q48.5 451.4 51.8 450.8L51.8 450.8Q61.5 449.9 70.2 447.6L70.2 447.6Q71.3 447.5 73.9 445.5L73.9 445.5Q81.6 440.5 88.0 435.7L88.0 435.7Q90.0 434.2 87.9 435.0L87.9 435.0Q83.2 437.3 78.3 440.1L78.3 440.1Q75.3 441.8 73.4 443.6L73.4 443.6Q71.5 445.4 68.4 443.8L68.4 443.8Q64.7 440.5 68.2 435.3L68.2 435.3Q68.6 434.7 68.7 434.1L68.7 434.1Q68.7 431.7 71.4 429.1L71.4 429.1Q73.7 427.3 75.1 424.3L75.1 424.3ZM101.2 478.7L101.2 478.7Q107.2 478.1 111.5 479.7L111.5 479.7Q116.7 481.9 118.6 484.6L118.6 484.6Q119.3 485.9 120.2 487.1L120.2 487.1Q124.1 489.8 122.1 493.0L122.1 493.0Q121.8 494.1 120.1 495.2L120.1 495.2Q119.3 495.9 118.4 497.5L118.4 497.5Q117.0 500.4 115.4 503.1L115.4 503.1Q114.1 505.4 116.5 504.2L116.5 504.2Q121.2 502.6 126.1 505.2L126.1 505.2Q131.4 508.2 136.0 509.6L136.0 509.6Q140.1 510.2 142.5 514.9L142.5 514.9Q143.5 517.5 141.3 519.8L141.3 519.8Q139.7 521.2 137.6 520.9L137.6 520.9Q134.3 520.8 127.7 517.0L127.7 517.0Q122.5 514.0 117.9 513.5L117.9 513.5Q110.8 513.2 94.8 514.6L94.8 514.6Q74.1 516.2 52.9 519.8L52.9 519.8Q51.2 520.7 46.4 520.1L46.4 520.1Q40.6 519.3 36.6 516.4L36.6 516.4Q33.7 514.3 36.7 513.4L36.7 513.4Q38.9 512.8 41.6 512.7L41.6 512.7L63.8 510.1Q65.7 509.8 63.8 507.4L63.8 507.4Q62.3 505.5 62.7 503.2L62.7 503.2Q63.3 501.0 62.0 496.4L62.0 496.4Q62.0 495.0 62.2 493.5L62.2 493.5Q62.3 492.5 64.3 491.3L64.3 491.3Q67.0 490.8 67.8 494.1L67.8 494.1Q69.2 500.7 74.6 506.4L74.6 506.4Q75.9 508.7 77.5 508.6L77.5 508.6Q79.3 508.4 78.8 505.9L78.8 505.9Q78.4 499.4 76.9 495.6L76.9 495.6Q75.7 494.2 75.8 492.6L75.8 492.6Q75.8 492.3 73.7 491.9L73.7 491.9Q70.0 491.0 67.8 489.2L67.8 489.2Q67.3 488.9 67.8 487.9L67.8 487.9Q69.7 486.7 72.4 486.2L72.4 486.2Q76.7 485.4 82.2 483.3L82.2 483.3Q91.6 479.7 101.2 478.7ZM103.3 487.0L103.3 487.0Q101.2 487.2 102.3 488.4L102.3 488.4Q104.4 491.1 102.8 497.4L102.8 497.4Q102.0 501.0 99.9 505.1L99.9 505.1Q98.8 506.9 100.7 506.8L100.7 506.8Q102.4 506.6 104.1 504.2L104.1 504.2Q108.4 498.2 111.0 489.7L111.0 489.7Q111.4 487.7 109.3 487.1L109.3 487.1Q107.0 486.6 103.3 487.0ZM93.2 490.9L93.2 490.9Q92.7 489.1 90.6 489.7L90.6 489.7Q87.5 490.5 84.6 491.3L84.6 491.3Q82.5 491.8 84.3 493.7L84.3 493.7Q86.0 495.6 86.5 498.0L86.5 498.0Q87.4 501.9 87.9 505.8L87.9 505.8Q88.0 507.8 88.6 507.8L88.6 507.8Q89.1 507.8 90.5 505.7L90.5 505.7Q94.5 499.1 93.2 490.9Z" />
              </defs>
              <g class="reader-opening__glyph" style="--glyph-delay:0ms">
                <use class="reader-opening__glyph-shadow" href="#reader-opening-glyph-kai" />
                <use class="reader-opening__glyph-wash" href="#reader-opening-glyph-kai" />
                <use class="reader-opening__glyph-fill" href="#reader-opening-glyph-kai" />
              </g>
              <g class="reader-opening__glyph" style="--glyph-delay:80ms">
                <use class="reader-opening__glyph-shadow" href="#reader-opening-glyph-juan" />
                <use class="reader-opening__glyph-wash" href="#reader-opening-glyph-juan" />
                <use class="reader-opening__glyph-fill" href="#reader-opening-glyph-juan" />
              </g>
              <g class="reader-opening__glyph" style="--glyph-delay:160ms">
                <use class="reader-opening__glyph-shadow" href="#reader-opening-glyph-you" />
                <use class="reader-opening__glyph-wash" href="#reader-opening-glyph-you" />
                <use class="reader-opening__glyph-fill" href="#reader-opening-glyph-you" />
              </g>
              <g class="reader-opening__glyph" style="--glyph-delay:240ms">
                <use class="reader-opening__glyph-shadow" href="#reader-opening-glyph-yi" />
                <use class="reader-opening__glyph-wash" href="#reader-opening-glyph-yi" />
                <use class="reader-opening__glyph-fill" href="#reader-opening-glyph-yi" />
              </g>
            </svg>
          </h1>
        </div>

        <div class="reader-opening__bottom">
          <div class="reader-opening__trace">
            <span></span>
            <em>{{ phaseCaption }}</em>
          </div>

          <div class="reader-opening__data-strip">
            <div class="reader-opening__book-meta">
              <div class="reader-opening__meta-row">
                <span>{{ format }}</span>
                <em>{{ author || props.i18n?.unknownAuthor || 'Unknown Author' }}</em>
              </div>
              <strong :class="titleClass">{{ title }}</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  bookInfo?: { title?: string; author?: string; cover?: string; format?: string; progress?: number }
  fileName?: string
  status?: 'opening' | 'finished'
  phaseText?: string
  i18n?: any
}>(), {
  bookInfo: () => ({}),
  fileName: '',
  status: 'opening',
  phaseText: ''
})

const visible = ref(true)
const ready = ref(false)
let exitTimer: ReturnType<typeof setTimeout> | undefined

const title = computed(() => props.bookInfo?.title || props.fileName?.replace(/\.[^.]+$/, '') || props.i18n?.unnamedBook || 'Unnamed book')
const author = computed(() => props.bookInfo?.author || '')
const format = computed(() => props.bookInfo?.format?.toUpperCase() || props.fileName?.split('.').pop()?.toUpperCase() || 'EPUB')
const hasCover = computed(() => !!props.bookInfo?.cover)
const phaseLabel = computed(() => props.phaseText || (props.status === 'finished' ? (props.i18n?.readingCompleteMotto || 'Reading complete') : (props.i18n?.openingMotto || 'A good book awaits')))
const phaseCaption = computed(() => props.status === 'finished' ? (props.i18n?.readingComplete || 'Reading complete') : (props.i18n?.readyToRead || 'Ready to read'))
const monogram = computed(() => {
  const clean = title.value.replace(/[《》<>[\]().,，。:：'"“”‘’]/g, '').trim()
  return clean.slice(0, 2) || format.value.slice(0, 2) || 'B'
})
const titleClass = computed(() => ({
  'is-long': title.value.replace(/\s/g, '').length > 18,
  'is-very-long': title.value.replace(/\s/g, '').length > 32
}))
const coverStyle = computed<Record<string, string>>(() => {
  if (!props.bookInfo?.cover) return {}
  return { '--opening-cover': `url(${JSON.stringify(props.bookInfo.cover)})` }
})
const openingClass = computed(() => ({
  'is-ready': ready.value,
  'is-finished': props.status === 'finished'
}))

const dismiss = () => {
  if (!visible.value || ready.value) return
  clearTimeout(exitTimer)
  ready.value = true
  exitTimer = setTimeout(() => {
    visible.value = false
  }, 1120)
}

const cleanup = () => {
  clearTimeout(exitTimer)
}

const isVisible = () => visible.value
defineExpose({ dismiss, cleanup, isVisible })
</script>

<style scoped lang="scss">
.reader-opening {
  --opening-cover: none;
  --opening-script-font: 'I.PenCrane-B', 'I-PenCrane-B-2', '华文行楷', 'STXingkai', '楷体', 'KaiTi', serif;
  --opening-ink: color-mix(in srgb, var(--b3-theme-on-background) 88%, #1c1510);
  --opening-paper: color-mix(in srgb, var(--b3-theme-background) 82%, #f7e9c9);
  --opening-accent: color-mix(in srgb, var(--b3-theme-primary) 70%, #d6a83f);
  --opening-shadow: color-mix(in srgb, #000 34%, var(--b3-theme-primary));
  position: absolute;
  inset: 0;
  z-index: 15;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: clamp(18px, 4vw, 58px);
  color: var(--opening-ink);
  background:
    radial-gradient(circle at 16% 12%, color-mix(in srgb, var(--opening-accent) 28%, transparent), transparent 32%),
    radial-gradient(circle at 92% 82%, color-mix(in srgb, #e8612d 18%, transparent), transparent 36%),
    linear-gradient(135deg, color-mix(in srgb, var(--b3-theme-surface) 86%, #f7ecd2) 0%, var(--opening-paper) 48%, color-mix(in srgb, var(--b3-theme-primary) 15%, var(--b3-theme-background)) 100%);
  pointer-events: none;

  &.is-ready {
    .reader-opening__stage {
      opacity: 0;
      transform: translate3d(0, 20px, 0) scale(.96);
      filter: blur(10px);
    }

    .reader-opening__book-object {
      transform: perspective(1200px) rotateX(9deg) rotateY(-48deg) rotateZ(-2deg) translate3d(-5vw, 1vh, 0);
    }

    .reader-opening__page-fan span {
      transform: translateX(clamp(52px, 7vw, 92px)) skewY(-11deg);
      opacity: .14;
    }

    .reader-opening__wash {
      opacity: 0;
      transform: scale(1.18);
    }
  }

  &.is-finished {
    --opening-accent: #41b883;
    background:
      radial-gradient(circle at 18% 14%, color-mix(in srgb, #41b883 28%, transparent), transparent 32%),
      radial-gradient(circle at 88% 82%, color-mix(in srgb, #f3c969 18%, transparent), transparent 34%),
      linear-gradient(135deg, color-mix(in srgb, var(--b3-theme-surface) 85%, #edf9ef) 0%, var(--opening-paper) 50%, color-mix(in srgb, #41b883 16%, var(--b3-theme-background)) 100%);
  }
}

.reader-opening__wash {
  position: absolute;
  inset: -18%;
  background-image:
    radial-gradient(circle at 52% 50%, color-mix(in srgb, var(--opening-accent) 22%, transparent), transparent 60%),
    var(--opening-cover);
  background-position: center;
  background-repeat: no-repeat;
  background-size: auto, cover;
  filter: blur(46px) saturate(1.25);
  opacity: .38;
  transform: scale(1);
  transition: opacity .9s ease, transform 1s ease;
}

.reader-opening__print {
  position: absolute;
  inset: 0;
  opacity: .14;
  background-image:
    linear-gradient(90deg, color-mix(in srgb, var(--opening-ink) 16%, transparent) 1px, transparent 1px),
    linear-gradient(0deg, color-mix(in srgb, var(--opening-ink) 10%, transparent) 1px, transparent 1px);
  background-size: 42px 42px, 42px 42px;
  mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 72%);
}

.reader-opening__stage {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(280px, .88fr) minmax(360px, 1.12fr);
  align-items: center;
  column-gap: clamp(54px, 8vw, 132px);
  row-gap: clamp(14px, 2.2vh, 28px);
  width: min(1220px, 100%);
  min-height: min(560px, 82vh);
  transition: opacity .7s ease, transform .9s cubic-bezier(.2,.8,.2,1), filter .7s ease;
  animation: reader-opening-stage-in .68s cubic-bezier(.2,.8,.2,1) both;
}

.reader-opening__cover-stack {
  position: relative;
  display: grid;
  place-items: center;
  min-height: clamp(330px, 60vh, 620px);
  transform: translateY(clamp(8px, 1.8vh, 22px));
}

.reader-opening__cover-echo {
  position: absolute;
  width: clamp(190px, 30vw, 390px);
  aspect-ratio: 2 / 3;
  border-radius: 8px;
  background-image:
    linear-gradient(145deg, color-mix(in srgb, var(--opening-accent) 36%, transparent), color-mix(in srgb, #101010 26%, transparent)),
    var(--opening-cover);
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  box-shadow: 0 26px 90px color-mix(in srgb, var(--opening-shadow) 32%, transparent);
  opacity: .2;
}

.reader-opening__cover-echo--one {
  transform: translate3d(-38px, -22px, 0) rotate(-10deg) skewY(-4deg);
}

.reader-opening__cover-echo--two {
  transform: translate3d(40px, 26px, 0) rotate(11deg) skewY(4deg);
  opacity: .16;
}

.reader-opening__book-object {
  position: relative;
  width: clamp(220px, 30vw, 400px);
  aspect-ratio: 2 / 3;
  transform: perspective(1200px) rotateX(8deg) rotateY(-17deg) rotateZ(-2deg);
  transform-style: preserve-3d;
  transition: transform 1s cubic-bezier(.2,.8,.2,1);
  animation: reader-opening-book-in .8s cubic-bezier(.2,.8,.2,1) both;
}

.reader-opening__cover-face {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 8px;
  background:
    linear-gradient(160deg, #ffffff18 0%, transparent 34%, #00000052 100%),
    linear-gradient(135deg, #334155 0%, #d7a945 52%, #1f2937 100%);
  box-shadow:
    0 34px 88px color-mix(in srgb, var(--opening-shadow) 42%, transparent),
    inset 10px 0 18px #00000022,
    inset 0 0 0 1px #ffffff42;
  transform: translateZ(36px);

  .has-cover & {
    background-image:
      linear-gradient(160deg, #ffffff18 0%, transparent 34%, #00000058 100%),
      var(--opening-cover);
    background-position: center;
    background-repeat: no-repeat;
    background-size: cover;
  }

  &::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 16%;
    background: linear-gradient(90deg, #00000055, transparent);
    mix-blend-mode: multiply;
  }

  &::after {
    content: '';
    position: absolute;
    inset: -18%;
    background: linear-gradient(112deg, transparent 34%, #ffffff70 48%, transparent 60%);
    transform: translateX(-70%) rotate(5deg);
    animation: reader-opening-shine 1.8s ease .28s both;
  }
}

.reader-opening__cover-noise {
  position: absolute;
  inset: 0;
  opacity: .22;
  background-image:
    repeating-linear-gradient(90deg, #ffffff20 0 1px, transparent 1px 6px),
    repeating-linear-gradient(0deg, #00000014 0 1px, transparent 1px 9px);
  mix-blend-mode: overlay;
}

.reader-opening__monogram {
  position: absolute;
  inset: 14% 12%;
  display: grid;
  place-items: center;
  color: #fff3;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(96px, 15vw, 210px);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
}

.reader-opening__cover-type {
  position: absolute;
  top: 18px;
  left: 20px;
  right: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #fff;
  font-size: 12px;
  letter-spacing: .16em;
  text-transform: uppercase;
  text-shadow: 0 2px 10px #0008;

  strong {
    padding: 6px 9px;
    border: 1px solid #ffffff5c;
    border-radius: 4px;
    background: #00000024;
    backdrop-filter: blur(8px);
  }
}

.reader-opening__cover-caption {
  position: absolute;
  left: 22px;
  right: 22px;
  bottom: 22px;
  display: grid;
  gap: 8px;
  color: #fff;
  text-shadow: 0 3px 18px #0009;

  strong {
    display: -webkit-box;
    overflow: hidden;
    font-family: var(--opening-script-font);
    font-size: clamp(22px, 3vw, 34px);
    font-weight: 500;
    line-height: 1.06;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  }

  span {
    overflow: hidden;
    font-size: 13px;
    letter-spacing: .08em;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: .86;
  }
}

.reader-opening__page-fan {
  position: absolute;
  inset: 4% -8% 4% auto;
  width: 28%;
  transform: translateZ(4px);

  span {
    position: absolute;
    top: calc(var(--i, 0) * 3%);
    right: 0;
    bottom: calc(var(--i, 0) * 3%);
    width: 84%;
    border-radius: 0 6px 6px 0;
    background:
      repeating-linear-gradient(0deg, #d6c7a8 0 1px, transparent 1px 10px),
      linear-gradient(90deg, #f7f0de, #fffaf0);
    box-shadow: 7px 0 24px #00000018;
    transform: translateX(calc(var(--i, 0) * 8px)) skewY(-6deg);
    transition: transform .85s cubic-bezier(.2,.8,.2,1), opacity .65s ease;
  }

  span:nth-child(1) { --i: 1; opacity: .72; }
  span:nth-child(2) { --i: 2; opacity: .54; }
  span:nth-child(3) { --i: 3; opacity: .36; }
  span:nth-child(4) { --i: 4; opacity: .22; }
}

.reader-opening__info {
  position: relative;
  display: flex;
  flex-direction: column;
  align-self: stretch;
  justify-self: end;
  min-width: 0;
  min-height: clamp(430px, 62vh, 640px);
  width: min(520px, 100%);
  padding: clamp(8px, 2vw, 22px) 0;

  &::before {
    content: '';
    position: absolute;
    inset: -26px -34px -30px -42px;
    z-index: -1;
    border-radius: 10px;
    background:
      linear-gradient(120deg, color-mix(in srgb, var(--opening-paper) 58%, transparent), transparent 72%),
      radial-gradient(circle at 0% 24%, color-mix(in srgb, var(--opening-accent) 18%, transparent), transparent 48%);
    filter: blur(.2px);
    opacity: .72;
  }
}

.reader-opening__kicker {
  display: flex;
  align-items: center;
  gap: 12px;
  color: color-mix(in srgb, var(--opening-ink) 68%, transparent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .18em;
  text-transform: uppercase;

  i {
    width: clamp(46px, 9vw, 118px);
    height: 1px;
    background: currentColor;
    opacity: .46;
  }
}

.reader-opening__motto {
  position: relative;
  display: block;
  width: clamp(118px, 12vw, 172px);
  margin: clamp(38px, 6.2vh, 72px) clamp(24px, 4vw, 74px) 0 auto;
  line-height: 0;
}

.reader-opening__motto-art {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  filter: drop-shadow(0 18px 28px color-mix(in srgb, var(--opening-shadow) 20%, transparent));
}

.reader-opening__glyph {
  opacity: 0;
  animation: reader-opening-glyph-in .58s cubic-bezier(.2,.8,.2,1) both;
  animation-delay: var(--glyph-delay);
}

.reader-opening__glyph-shadow,
.reader-opening__glyph-wash,
.reader-opening__glyph-fill {
  transform-box: fill-box;
  transform-origin: center;
}

.reader-opening__glyph-shadow {
  fill: color-mix(in srgb, var(--opening-shadow) 22%, transparent);
  transform: translate(8px, 9px);
}

.reader-opening__glyph-wash {
  fill: color-mix(in srgb, var(--opening-accent) 34%, var(--opening-ink));
  opacity: .18;
  stroke: color-mix(in srgb, var(--opening-accent) 36%, transparent);
  stroke-width: 12px;
  stroke-linejoin: round;
}

.reader-opening__glyph-fill {
  fill: color-mix(in srgb, var(--opening-ink) 88%, #111827);
  stroke: color-mix(in srgb, var(--opening-ink) 24%, transparent);
  stroke-width: .5px;
  paint-order: stroke fill;
}

.reader-opening__bottom {
  grid-column: 1 / -1;
  width: 100%;
  padding-top: 0;
  transform: translateY(clamp(-26px, -3vh, -14px));
}

.reader-opening__data-strip {
  width: min(100% + 48px, calc(100vw - 48px));
  margin-top: 16px;
  margin-right: auto;
  margin-left: auto;
  border: 0;
  background: transparent;
  box-shadow: none;

  div {
    position: relative;
    min-width: 0;
    padding: 22px clamp(34px, 4.5vw, 64px) 24px;
    overflow: visible;
    border: 0;
    border-radius: 1px;
    background:
      linear-gradient(95deg, #fffefa 0%, #f8f2e8 52%, #ffffff 100%),
      repeating-linear-gradient(3deg, #ffffff28 0 1px, transparent 1px 9px);
    clip-path: polygon(0 13%, 5% 8%, 10% 12%, 16% 7%, 23% 11%, 31% 8%, 39% 12%, 48% 7%, 57% 11%, 66% 8%, 75% 12%, 84% 7%, 93% 11%, 100% 14%, 100% 86%, 94% 91%, 86% 87%, 77% 92%, 68% 88%, 59% 92%, 50% 88%, 41% 93%, 32% 88%, 24% 92%, 16% 88%, 8% 92%, 0 87%);
    box-shadow:
      inset 0 1px 0 #ffffff,
      inset 0 -7px 16px #d7cfc230,
      0 8px 12px color-mix(in srgb, #000 18%, transparent),
      0 22px 30px color-mix(in srgb, #000 16%, transparent);
    filter: none;
    backdrop-filter: none;

    &::before {
      content: '';
      position: absolute;
      inset: 8px 16px;
      background:
        radial-gradient(circle at 8% 22%, #0000000d 0 1px, transparent 2px),
        repeating-linear-gradient(90deg, transparent 0 28px, #00000006 28px 29px, transparent 29px 56px);
      opacity: .55;
      pointer-events: none;
    }

    &::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: -5px;
      height: 8px;
      background: linear-gradient(90deg, transparent, #d8cfbf70, transparent);
      opacity: .55;
      filter: blur(.8px);
      pointer-events: none;
    }
  }

  .reader-opening__meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;

    &::before {
      display: none;
    }
  }

  span,
  strong,
  em {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  span {
    color: color-mix(in srgb, var(--opening-ink) 54%, transparent);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .16em;
  }

  strong {
    display: -webkit-box;
    margin: 16px -2px 0;
    padding-top: 12px;
    border-top: 1px dashed color-mix(in srgb, var(--opening-ink) 16%, transparent);
    color: var(--opening-ink);
    font-family: var(--opening-script-font);
    font-size: clamp(24px, 2.8vw, 38px);
    font-weight: 500;
    line-height: 1.02;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;

    &.is-long {
      font-size: clamp(21px, 2.3vw, 31px);
    }

    &.is-very-long {
      font-size: clamp(18px, 1.9vw, 25px);
      line-height: 1.12;
      -webkit-line-clamp: 3;
    }
  }

  em {
    flex: 1 1 auto;
    color: color-mix(in srgb, var(--opening-ink) 62%, transparent);
    font-size: 13px;
    font-style: normal;
    letter-spacing: .04em;
    white-space: nowrap;
  }
}

.reader-opening__trace {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  margin-top: 0;
  color: color-mix(in srgb, var(--opening-ink) 64%, transparent);

  span {
    position: relative;
    flex: 1 1 auto;
    height: 2px;
    overflow: hidden;
    background: color-mix(in srgb, var(--opening-ink) 12%, transparent);

    &::before {
      content: '';
      position: absolute;
      inset: 0;
      width: 42%;
      background: var(--opening-accent);
      animation: reader-opening-trace 1.8s ease-in-out infinite;
    }
  }

  em {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.opening-splash-enter-active,
.opening-splash-leave-active {
  transition: opacity .42s ease;
}

.opening-splash-enter-from,
.opening-splash-leave-to {
  opacity: 0;
}

@media (max-width: 760px) {
  .reader-opening {
    padding: 20px;
  }

  .reader-opening__stage {
    grid-template-columns: 1fr;
    gap: 18px;
    align-content: center;
    min-height: 100%;
  }

  .reader-opening__cover-stack {
    min-height: clamp(270px, 46vh, 420px);
  }

  .reader-opening__book-object {
    width: min(58vw, 260px);
  }

  .reader-opening__info {
    justify-self: center;
    width: min(520px, 100%);
    min-height: auto;
    text-align: center;
  }

  .reader-opening__kicker,
  .reader-opening__trace {
    justify-content: center;
  }

  .reader-opening__data-strip {
    text-align: left;
  }

  .reader-opening__motto {
    margin-right: auto;
    margin-left: auto;
    width: clamp(104px, 28vw, 140px);
  }

  .reader-opening__bottom {
    margin-top: clamp(22px, 4vh, 36px);
    margin-right: auto;
    margin-left: auto;
  }
}

@keyframes reader-opening-stage-in {
  from {
    opacity: 0;
    transform: translate3d(0, 18px, 0) scale(.98);
    filter: blur(8px);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
    filter: blur(0);
  }
}

@keyframes reader-opening-book-in {
  from {
    opacity: 0;
    transform: perspective(1200px) rotateX(16deg) rotateY(-34deg) rotateZ(-8deg) translate3d(-28px, 18px, 0);
  }
  to {
    opacity: 1;
    transform: perspective(1200px) rotateX(8deg) rotateY(-17deg) rotateZ(-2deg);
  }
}

@keyframes reader-opening-shine {
  0% {
    opacity: 0;
    transform: translateX(-70%) rotate(5deg);
  }
  34% {
    opacity: .86;
  }
  100% {
    opacity: 0;
    transform: translateX(72%) rotate(5deg);
  }
}

@keyframes reader-opening-glyph-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes reader-opening-trace {
  0% {
    transform: translateX(-112%);
  }
  100% {
    transform: translateX(246%);
  }
}
</style>
