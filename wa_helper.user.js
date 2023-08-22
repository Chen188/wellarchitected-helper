// ==UserScript==
// @name         WA Helper
// @namespace    https://github.com/Chen188/wellarchitected-helper
// @version      0.2
// @description  Skip pillars not used in a specific workload automatically, save time and enjoy your life!
// @author       Chen188@github.com
// @match        https://*.console.aws.amazon.com/wellarchitected*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=amazon.com
// @grant        window.onurlchange
// ==/UserScript==

'use strict';

// pillars not needed, same order with your console
var pillar_indexes = null;
// var pillar_indexes=[5];

let reg = /workload.*lens.*wellarchitected.*questions.*/;
let $pillars = null;

let total_question_processed = 0;
let $mask_root = null, $mask_body = null;


let glb_style = `
#mask{
    position: fixed;
    top: 40px;
    width: 100vw;
    height: 100vh;
    background-color: rgb(65 65 65 / 88%);
    z-index: 9999;
    text-align: center;
    user-select: none;
    display: flex;
    align-content: flex-end;
    align-items: center;
    justify-content: center;
    flex-direction: column;
}

#mask .mask-container {
    display: block;
    width: 650px;
    height: 400px;
    background-color: rgb(255,255,255,0.8);
    border-radius: 8px;
    overflow: hidden;
}

#mask .mask-header {
    padding: 8px 0;
}

#mask .mask-window-btn-group {
    display: flex;
    position: fixed;
    padding-left: 1em;
    font-family: 'Inter';
    font-size: 0.8em;
    margin-top: 0.3em;
}

#mask .mask-window-btn-group .window-btn {
    border-radius: 50%;
    width: 1.2em;
    height: 1.2em;
    line-height: 1.2em;
    margin-right: 0.5em;
    cursor: pointer;
}

#mask .mask-window-btn-group .window-btn.disabled {
    cursor: default;
}

#btn-save-exit {
    background-color: rgb(236,98,102);
    color: rgb(236,98,102);
}

#btn-save-exit.disabled,
#btn-hide-mask.disabled {
    background-color: rgb(188 188 188);
    color: rgb(188 188 188);
}

#mask .mask-window-btn-group:hover #btn-save-exit:not(.disabled) {
    color: rgb(107,20,9);
}

#btn-hide-mask {
    background-color: #ffbb2d;
    color: #ffbb2d;
}

#mask .mask-window-btn-group:hover #btn-hide-mask:not(.disabled) {
    color: rgb(168,115,38);
}

#mask .mask-status {
    font-weight: bold;
    font-size: 1.2em;
    color: #505050;
}

#mask .mask-status.done {
    color: #00aa00;
}

#mask .mask-body {
    text-align: left;
    padding: .2em 0.6em;
    background-color: black;
    height: calc( 100% - 35px );
    color: #27de0d;
}

#mask .mask-body > * {
    display: block;
    margin: .2em;
}


.checkbox-container {
    display: flex;
}

.checkbox-container label {
    margin-left: 6px;
}

#btn-start {
    width: 100%;
    padding: 12px;
    margin-bottom: 12px;
    color: #545b65;
    border: 1px solid #545b65;
    border-radius: 4px;
    font-size: 1.1em;
    cursor: pointer;
    transition: font-weight 0.1s;
}

#btn-start.disabled {
    color: #aaa;
    border-color: #ccc;
    cursor: not-allowed;
}

#btn-start:not(.disabled):hover {
    color: black;
    font-weight: 700;
    background-color: #fff;
}
`

function sleep(time) {
    return new Promise( (resolve) => {
        setTimeout(resolve, time);
    })
}

function initCheckboxDOM() {
    function _genCheckboxDOM(pillar_id) {
        var _chkbox_container = document.createElement('div');
        _chkbox_container.classList.add('checkbox-container');

        var _chkboxDOM = `
        <input type="checkbox" id="${pillar_id}">
        <label for="${pillar_id}">选中以自动填充</label>
        `;

        _chkbox_container.innerHTML = _chkboxDOM;

        return _chkbox_container;
    }

    const $ass_steps = document.querySelectorAll('.aas-step');
    $ass_steps.forEach(($ass_step, idx) => {
        $ass_step.prepend(_genCheckboxDOM(`pillar-chkbox-${idx}`))
    })

    var $btn_start = document.createElement('button');
    $btn_start.setAttribute('id', 'btn-start');
    $btn_start.classList.add('disabled');
    $btn_start.innerText = '开始自动填充';

    // prepend btn to question nav
    document.querySelector('#questionNavigation')
        .prepend($btn_start);;
}

function bindChkboxEvent() {
    let checked_num = 0;
    let $btn_start = document.querySelector('#btn-start');

    function _onChkboxChange(e) {
        var $_chkbox = e.target;
        var $_pillar_id = $_chkbox.id;

        if ($_chkbox.checked) {
            checked_num ++;

            if (checked_num == 1) {
                $btn_start.classList.remove('disabled');
            }
        } else {
            checked_num --;
            if (checked_num == 0){
                $btn_start.classList.add('disabled');
            }

        }
    }
    document.querySelectorAll('.checkbox-container input[type="checkbox"]')
        .forEach(ele => {ele.onchange = _onChkboxChange});
}

function bindBtnStartEvent() {

    function _onBtnStartClick(e) {
        if (e.target.classList.contains('disabled')) {
            return;
        }

        let $_chkbox_checked = document.querySelectorAll('.checkbox-container input[type="checkbox"]:checked');
        pillar_indexes = Array.from($_chkbox_checked).map(ele => {return ele.id.split('-')[2];})

        startTask($pillars);
    }

    let $btn_start = document.querySelector('#btn-start');
    $btn_start.onclick = _onBtnStartClick;
}

function initMaskDOM() {
    if ($mask_root) {
        return;
    }

    const html = `

    <div id="mask">
        <div class='mask-container'>
            <div class="mask-header">
                <div class="mask-window-btn-group">
                    <div id='btn-save-exit' title='保存并退出' class="disabled window-btn">×</div>
                    <div id="btn-hide-mask" title='关闭弹窗' class="disabled window-btn">－</div>
                </div>
                <div class="mask-status">请等待...</div>
            </div>
            <div class='mask-body'></div>
        </div>
    </div>`;

    const div = document.createElement('div');
    div.innerHTML = html;

    document.body.prepend(div);

    $mask_root = div
    $mask_body = $mask_root.querySelector('.mask-body');
}

function bindMaskCloseWindowBtnEvent() {
    function _reset_mask() {
        $mask_root.remove();
        $mask_body = $mask_root = null;
    }
    function _onClickSaveExit(e) {
        if (e.target.classList.contains('disabled')) {
            return;
        }
        var $question_save_exit = document.querySelector('#questionWizard-saveAndExitButton');
        if($question_save_exit) {
            $question_save_exit.click();
        }

        _reset_mask();
    }
    function _onClickHideMask(e) {
        if (e.target.classList.contains('disabled')) {
            return;
        }
        _reset_mask();
        foldAllPillars();
    }

    document.querySelector('#btn-save-exit').onclick = _onClickSaveExit;
    document.querySelector('#btn-hide-mask').onclick = _onClickHideMask;
}
function myPrint(...text) {
    var _txt = text.join('');
    var _pre = document.createElement('pre');
    _pre.innerText = _txt;

    $mask_body.prepend(_pre);
    console.log(_txt);
}

function taskDone() {
    myPrint('----------------------------');
    myPrint(`Done. ${total_question_processed} questions processed.`);
    myPrint('----------------------------');

    let $mask_status = $mask_root.querySelector('.mask-status');
    $mask_status.innerText = '已完成';
    $mask_status.classList.add('done');

    let $mask_window_btns = $mask_root.querySelectorAll('.window-btn');
    $mask_window_btns.forEach(ele => {ele.classList.remove('disabled')});
}

async function markNotApplicable(question){
    question.querySelector('button').click();
    await sleep(2000); // wait question description dom appear
    document.querySelector('#notApplicable input[type="checkbox"]').click();

    var next_btn = document.querySelector('#questionWizard-nextQuestionButton');
    var save_exit_btn = document.querySelector('#questionWizard-saveAndExitButton-finalQuestion');

    var btn_to_click = next_btn || save_exit_btn;

    if(! btn_to_click) {
        alert("failed to find Next button or Save button, pls check log for detail");
    }
    else {
        btn_to_click.click();
    }

    await sleep(2000); // wait result submit
}

async function waitElement(selector, max_retry=120) {
    let $_element, _retry = 0;

    while (_retry < max_retry) {
        $_element = document.querySelectorAll(selector);
        if ($_element.length > 0) {
            return $_element
        }

        await sleep(1000);
        _retry ++;
    }

    const err_msg = `Timeout waiting for DOM ${selector} in 10 seconds, make sure you're running script after page is fully loaded.`;
    alert(err_msg);

    throw new Error(err_msg);
}

function foldAllPillars() {
    var $_pillars_to_fold = document.querySelectorAll('div[aria-expanded="true"]');
    $_pillars_to_fold.forEach(ele => {
        ele.click();
    })
}

async function startTask($pillars) {
    async function _doOnePiller(pillar_index){
        myPrint("process piller: ", $pillars[pillar_index].textContent);

        // expend pillar
        $pillars[pillar_index].click();

        // get parent question dom.
        let question_dom_id = $pillars[pillar_index].parentElement.id.split('-trigger')[0]

        // process questions under this pillar
        let questions=document.querySelectorAll(`[id='${question_dom_id}'] .wizard-sidebar-question`)

        let question_idx = 0, question_processed = 0;
        for (; question_idx < questions.length; question_idx ++) {
            let question = questions[question_idx];
            let question_done = question.querySelector('.wizard-question-status').textContent.length > 0;
            let question_desc = question.querySelector('.wizard-question-text').textContent;

            if (question_done) {
                myPrint('    ', question_desc, ' - skipped')
                continue;
            }
            myPrint('    ', question_desc, ' - done')

            await markNotApplicable(question);
            question_processed ++;
            total_question_processed ++;
        }

        if(question_processed > 0) {
            await sleep(1000);
        }
    }

    initMaskDOM();
    bindMaskCloseWindowBtnEvent();

    for (var pillar_index of pillar_indexes) {
        await _doOnePiller(pillar_index);
    }

    taskDone();
}
(async function() {
    async function _ () {
        if (! reg.test(location.href)) {
            return;
        }

        $pillars = await waitElement('.wizard-pillar-header');
        foldAllPillars();
        initCheckboxDOM();
        bindChkboxEvent();
        bindBtnStartEvent();
    }

    var $style = document.createElement('style');
    $style.innerHTML = glb_style;

    document.head.prepend($style);

    if (window.onurlchange === null) {
        // feature is supported
        window.addEventListener('urlchange', _);
    }
    _();
})();
