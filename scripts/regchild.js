class REGChild extends Application{
    static ID = 'random-everything-generator';
    static TEMPLATES = {
        MAIN: `modules/${this.ID}/templates/random-everything-generator-child.hbs`,
        NOUN: `modules/${this.ID}/templates/noun.hbs`
    };
    static log(force, ...args) {
        const shouldLog = force || game.modules.get('_dev_mode')?.api?.getPackageDebugValue(this.ID);
        if (shouldLog) {
            console.log(this.ID, '|', ...args);
        }
    };
    Title;
    XML;
    Path = '';
    Markov;
    Members = {};
    LinkedMembers = [];
    markovJSON = '';
    RegenCallbacks = {};
    DropdownCallbacks = {};
    DeleteCallbacks = {};
    OpenChildCallBacks = {};

    constructor(title, noun=false) {
        super({
            title: `${title} - Random Everything Generator`,
            template: (noun) ? REGChild.TEMPLATES.NOUN : REGChild.TEMPLATES.MAIN,
            height: (noun) ? '500' : 'auto'
        });
        this.Title = title;
    }

    static get defaultOptions() {
        const overrides = {
            width: 'auto',
            resizable: true,
            minimizable: true,
            editable: true
        }

        return foundry.utils.mergeObject(super.defaultOptions, overrides);
    }

    async loadMembers() {
        let getCache = {};
        for (let key of Object.keys(document.RandomEverythingGeneratorData)) {
            let re = new RegExp(this.Path + '\._member\.(\\d+)\\.(.*)\\.');
            let m = key.match(re);
            if (m) {
                let  label = m[2];

                if (getCache[m[1] + '.' + m[2]])
                    continue;
                getCache[m[1] + '.' + m[2]] = true;
                await $.get(`/modules/random-everything-generator/xml/${m[2]}.xml`, xml => {
                    let category = $(xml).find('category');
                    label = $(category).attr('name');

                    this.LinkedMembers.push({
                        index: m[1],
                        label,
                        path: this.Path + `._member.${m[1]}.${m[2]}`,
                        file: m[2],
                        xml: (new XMLSerializer()).serializeToString(xml)
                    });
                });
            }
        }
    }

    fromMarkov() {
        let r = '';   
        var markov = JSON.parse(this.Markov);
        r = this.getNextLetter(markov, '');
        while (r.length < 3 || r.substr(r.length-2) != '--') {
            r += this.getNextLetter(markov, r.substr(r.length-1))
        }
        r = r.substr(0, r.length-2);
        return r;
    }

    getNextLetter(markov, prev) {
        // Get a capital letter to start
        let nxt = markov[prev];
        let total = 0
        Object.keys(nxt).forEach(letter => total += nxt[letter])
        let rnd = Math.floor(Math.random() * total);
        let r = '';
        let i = 0;
        Object.keys(nxt).every(letter => {
            i += parseInt(nxt[letter]);
            if (i > rnd) {
                r += letter;
                return false;
            }
            return true;
        });
        return r;
    }

    createRegenButton(path) {
        const a = $('<a></a>');
        const i = $('<i></i>');
        $(a).click(callback);
        $(i).addClass('fas fa-sync-alt');
        $(i).css({'display': 'inline-block', 'margin-left': '5px'})

        a.append(i);
        return a;
    }

    xmlToString(xmlData) {
        return (new XMLSerializer()).serializeToString(xmlData);
    }

    processRegions(value, path) {
        if ($(value).attr('region_include')) {
          let includes = value.getAttribute('region_include').split('|');
          let starts = value.getAttribute('region_start').split('|');
          let ends = value.getAttribute('region_end').split('|');

          // When processing the textValue, it will change the position of the
          // letters, so process it backwards, that way the start/stops do not
          // get shifted when the string value changes.
          let  r = value.textContent;
          for (let i = includes.length - 1; i >= 0; i--){
            let start = starts[i];
            let end = ends[i];
            let length = end-start;
            let before = r.substr(0, start);
            let at = r.substr(start, length);
            let after = r.substr(end);
            let linkId =  '{{appid}}' + path + '.' + i;
            let className = 'reg-link';
            if (includes[i] == '__noun__')
                className += ' reg-is-noun';
            let link = `<a id='${linkId}' class='${className}'>${at}</a>`;

            this.OpenChildCallBacks[linkId] = () => {
                let file = includes[i];
                let localPath = `${path}.${i}`;

                if (file == '__noun__') {
                    // Open the Noun Window
                    const regChild = new REGChild(at, true);
                    regChild.Path = localPath;
                    regChild.render(true);
                } else {
                    // Open a Child Window
                    console.log(document.RandomEverythingGeneratorData[localPath])
                    if (document.RandomEverythingGeneratorData[localPath] && 
                        document.RandomEverythingGeneratorData[localPath] != parseInt(document.RandomEverythingGeneratorData[localPath])) {
                        // There is already a selected value for this category
                        file = document.RandomEverythingGeneratorData[localPath];
                        //localPath += '.' + file;
                    }
                    document.RandomEverythingGeneratorData[localPath] = file;
                    $.get(`/modules/random-everything-generator/xml/${file}.xml`, xml => {
                        if ($(xml).find('categories').length > 0) {
                            // Prompt user for a category selection
                            const categories = $(xml).find('categories')[0];
                            // This is a container for other categories
                            
                            let reg = new RandomEverythingGenerator();
                            for (const cat of categories.children) {
                                reg.Choices[$(cat).attr('id')] = $(cat).attr('name')
                            }
                            reg.XML = this.xmlToString(xml);
                            reg.Categories = $(xml).find('categories');
                            reg.Path = localPath;
                            reg.render(true);
                        } else {
                            const category = $(xml).find('category')[0];
                            const regChild = new REGChild($(category).attr('name'));
                            regChild.XML = this.xmlToString(xml);
                            regChild.Path = localPath;
                            regChild.Markov = this.Markov;
                            regChild.render(true);
                        }
                    })
                }

                console.log(localPath);
            }

            r = before+link+after;
          }
          return r;
        } else {
            if (!value) {
                console.warn("Value is empty");
                return '';
            } else {
                return value.textContent;
            }
            
        }
    }

    valueFromTable(node, path) {
        if ($(node).attr('include')) {
            // These shouldn't exist anymore
            console.warn("Invalid include attribute in " + node.getAttribute('id'));
            return;
        }


        const tableName = $(node).attr('name');
        const tableId = $(node).attr('id')
        const tableType = $(node).attr('type') || 'standard';

        switch(tableType) {
            case 'standard': {
                const localPath = path + '.' + tableId;

                // Deleted Node. Skip it.
                if (document.RandomEverythingGeneratorData[localPath] == -2)
                    return;

                const values = $(node).find('value');

                let randValue = null;
                if (document.RandomEverythingGeneratorData[localPath] &&
                    parseInt(document.RandomEverythingGeneratorData[localPath])!=document.RandomEverythingGeneratorData[localPath] &&
                    document.RandomEverythingGeneratorData[localPath].length > 0)
                {
                    // Is a text value
                    randValue = -1
                } else if (parseInt(document.RandomEverythingGeneratorData[localPath])==document.RandomEverythingGeneratorData[localPath]) {
                    // In an int value
                    randValue = parseInt(document.RandomEverythingGeneratorData[localPath]);
                } else {
                    // Either null or something unexpected
                    randValue = Math.floor(Math.random() * values.length);
                }

                if (randValue >= 0)
                    document.RandomEverythingGeneratorData[localPath] = randValue;
                
                this.RegenCallbacks[localPath] = () => {
                    const randValue = Math.floor(Math.random() * values.length);
                    document.RandomEverythingGeneratorData[localPath] = randValue;
                    document.getElementById('reg-val-' + localPath).innerHTML = this.processRegions(values[randValue], localPath + '.' + randValue);
                }

                this.DropdownCallbacks[localPath] = () => {
                    const div = $(`#${this.id}-reg-option-select`);
                    $(div).empty();
                    const input = $('<input placeholder="Set your own value"/>');

                    // If the value is text, set it as default value for input
                    if (document.RandomEverythingGeneratorData[localPath] != parseInt(document.RandomEverythingGeneratorData[localPath]) && document.RandomEverythingGeneratorData[localPath].length > 0)
                        input.val(document.RandomEverythingGeneratorData[localPath]);

                    input.on('keypress', e => {
                      if (e.which == 13) {
                        e.preventDefault();
                        document.getElementById('reg-val-' + localPath).innerHTML = $(input).val();
                        document.RandomEverythingGeneratorData[localPath] = $(input).val();
                        $(div).empty();
                        $(div).css('display', 'none');          
                      }
                    });
                    $(div).append(input);

                    const x = $('<i class="far fa-window-close"></i>');
                    $(x).click(ev => {
                        ev.preventDefault();
                        $(div).empty();
                        $(div).css('display', 'none')
                    })
                    $(div.append(x))

                    for (let i = 0; i < values.length; i++) {
                        const value = values[i];
                        let divOption = $('<div></div>');
                        let a = $('<a></a>')
                        $(a).html(value.textContent);
                        $(a).click(ev => {
                            document.getElementById('reg-val-' + localPath).innerHTML = $(a).html();
                            document.RandomEverythingGeneratorData[localPath] = i;
                            $(div).empty();
                            $(div).css('display', 'none');
                        });
                        $(divOption).append(a);
                        $(div).append(divOption);
                    }
                    $(div).css('display', 'block');
                }

                this.DeleteCallbacks[localPath] = () => {
                    $(document.getElementById('reg-val-' + localPath).parentNode).remove()
                    document.RandomEverythingGeneratorData[localPath] = -2;
                }

                return (randValue == -1)
                    ? document.RandomEverythingGeneratorData[localPath] // -1 means user inputed text
                    : this.processRegions(values[randValue], localPath + '.' + randValue);

                break;
            }
            case 'pattern':
            case 'name': {
                const localPath = this.Path + '.' + $(node).attr('id');

                this.RegenCallbacks[localPath] = () => {
                    const newName = this.generateName(node);
                    document.RandomEverythingGeneratorData[localPath] = newName;
                    document.getElementById('reg-val-' + localPath).innerHTML = newName;
                }

                this.DropdownCallbacks[localPath] = () => {
                    const div = $(`#${this.id}-reg-option-select`);
                    $(div).empty();
                    const input = $('<input placeholder="Set your own value"/>');

                    // If the value is text, set it as default value for input
                    if (document.RandomEverythingGeneratorData[localPath] && document.RandomEverythingGeneratorData[localPath] != parseInt(document.RandomEverythingGeneratorData[localPath]) && document.RandomEverythingGeneratorData[localPath].length > 0)
                        input.val(document.RandomEverythingGeneratorData[localPath]);

                    input.on('keypress', e => {
                        if (e.which == 13) {
                            e.preventDefault();
                            document.getElementById('reg-val-' + localPath).innerHTML = $(input).val();
                            document.RandomEverythingGeneratorData[localPath] = $(input).val();
                            $(div).empty();
                            $(div).css('display', 'none');          
                        }
                    });
                    $(div).append(input);
                    $(div).css('display', 'block');
                }

                this.DeleteCallbacks[localPath] = () => {
                    $(document.getElementById('reg-val-' + localPath).parentNode).remove()
                    document.RandomEverythingGeneratorData[localPath] = -2;
                }

                const name = document.RandomEverythingGeneratorData[localPath] || this.generateName(node)
                document.RandomEverythingGeneratorData[localPath] = name;
                return name;
                break;
            }
        }
    }

    async valueFromInclude(child) {
        const include = $(child).attr('include');
        const localPath = this.Path + '.' + include;

        this.RegenCallbacks[localPath] = () => {
            $.get('/modules/random-everything-generator/xml/'+include+'.xml', data => {
                const table = $(data).find('table')[0];
                const values = $(table).find('value');
                const value = values[Math.floor(Math.random() * values.length)];
                document.RandomEverythingGeneratorData[localPath] = value.textContent;
                document.getElementById('reg-val-' + localPath).innerHTML = this.processRegions(value, localPath);
            });
        }

        this.DropdownCallbacks[localPath] = () => {
            const include = $(child).attr('include');
            const localPath = this.Path + '.' + include;

            const div = $(`#${this.id}-reg-option-select`);
            $(div).empty();
            const input = $('<input placeholder="Set your own value"/>');

            // If the value is text, set it as default value for input
            if (document.RandomEverythingGeneratorData[localPath] != parseInt(document.RandomEverythingGeneratorData[localPath]) && document.RandomEverythingGeneratorData[localPath].length > 0)
                input.val(document.RandomEverythingGeneratorData[localPath]);

            input.on('keypress', e => {
              if (e.which == 13) {
                e.preventDefault();
                document.getElementById('reg-val-' + localPath).innerHTML = $(input).val();
                document.RandomEverythingGeneratorData[localPath] = $(input).val();
                $(div).empty();
                $(div).css('display', 'none');          
              }
            });
            $(div).append(input);

            $.get('/modules/random-everything-generator/xml/'+include+'.xml', data => {
                const table = $(data).find('table')[0];
                const values = $(table).find('value');
                for (let i = 0; i < values.length; i++) {
                    const value = values[i];
                    let divOption = $('<div></div>');
                    let a = $('<a></a>')
                    $(a).html(value.textContent);
                    $(a).click(ev => {
                        document.getElementById('reg-val-' + localPath).innerHTML = $(a).html();
                        document.RandomEverythingGeneratorData[localPath] = i;
                        $(div).empty();
                        $(div).css('display', 'none');
                    });
                    $(divOption).append(a);
                    $(div).append(divOption);
                }
                $(div).css('display', 'block');
            })
        }

        this.DeleteCallbacks[localPath] = () => {
            $(document.getElementById('reg-val-' + localPath).parentNode).remove()
            document.RandomEverythingGeneratorData[localPath] = -2;
        }

        let result = {};        
        result['id'] = this.Path + '.' + $(child).attr('include');
        result['key'] = $(child).attr('name').replace(/(\.\.\.|:)$/,'');
        if (document.RandomEverythingGeneratorData[localPath]) {
            result['value'] = document.RandomEverythingGeneratorData[localPath];
            return result
        } else {
            return await $.get('/modules/random-everything-generator/xml/'+include+'.xml', data => {
            });
        }
    }

    generateName(node) {
        const nodePatterns = node.getElementsByTagName("patterns");
        if (nodePatterns.length == 0)
            return;
        const nodePattern = nodePatterns[0].getElementsByTagName("pattern");
        let htmlValue = '';
        // Choose a random pattern
        const pattern = nodePattern[Math.floor(Math.random()*nodePattern.length)]
        let p = pattern.textContent;
        let m = p.match(/\{(.*?)\}/);
        while (m && m.length > 0) {
            const listType = m[1];
            switch (listType) {
                case 'markov': {
                    p = p.replace('{markov}', this.fromMarkov());
                    break;
                }
                default: {
                    let values = []
                    const nodesList = node.getElementsByTagName("list");
                    for (let i = 0; i < nodesList.length; i++) {
                        if (nodesList[i].getAttribute("type") == listType) {
                            let items = nodesList[i].getElementsByTagName("item");
                            for (let j = 0; j < items.length; j++) {
                                values.push(items[j].textContent);
                            }
                        }
                    }
                    let r = values[Math.floor(Math.random()*values.length)];
                    p = p.replace('{'+m[1]+'}', r);
                    break;
                }
            }
            m = p.match(/\{(.*?)\}/);
        }
        return p;
    }

    async populateCategory() {
        let r = [];
        console.log(this.Path)
        let xml = $.parseXML(this.XML);
        let nodeCategory = $(xml).find('category')[0];
        let nodeName = $(nodeCategory).find('name');

        // Place Name first
        if (nodeName.length > 0) {
            let localPath = this.Path + '.name';
            let name = {};
            name['id'] = localPath
            name['key'] = 'Name';
            name['value'] = (document.RandomEverythingGeneratorData[localPath])
                ? document.RandomEverythingGeneratorData[localPath]
                : this.fromMarkov();
            document.RandomEverythingGeneratorData[localPath] = name['value'];

            this.RegenCallbacks[localPath] = () => {
                let name = this.fromMarkov();
                document.getElementById(`reg-val-${localPath}`).innerHTML = name;
                document.RandomEverythingGeneratorData[localPath] = name
            };

            this.DropdownCallbacks[localPath] = () => {
                const div = $(`#${this.id}-reg-option-select`);
                $(div).empty();
                const input = $('<input placeholder="Set your own value"/>');

                // If the value is text, set it as default value for input
                if (document.RandomEverythingGeneratorData[localPath] && document.RandomEverythingGeneratorData[localPath] != parseInt(document.RandomEverythingGeneratorData[localPath]) && document.RandomEverythingGeneratorData[localPath].length > 0)
                    input.val(document.RandomEverythingGeneratorData[localPath]);

                input.on('keypress', e => {
                  if (e.which == 13) {
                    e.preventDefault();
                    document.getElementById('reg-val-' + localPath).innerHTML = $(input).val();
                    document.RandomEverythingGeneratorData[localPath] = $(input).val();
                    $(div).empty();
                    $(div).css('display', 'none');          
                  }
                });
                $(div).append(input);
                $(div).css('display', 'block');
            }

            this.DeleteCallbacks[localPath] = () => {
                $(document.getElementById('reg-val-' + localPath).parentNode).remove()
                document.RandomEverythingGeneratorData[localPath] = -2;
            }

            r.push(name);
        }

        for (const child of nodeCategory.children) {
            switch (child.tagName) {
                case 'table': {
                    let result = {};
                    result['id'] = this.Path + '.' + $(child).attr('id');
                    result['key'] = $(child).attr('short') || $(child).attr('name').replace(/(\.\.\.|:)$/,'');
                    result['value'] = this.valueFromTable(child, this.Path)
                    r.push(result);
                    break;
                }
                case 'include': {
                    const include = $(child).attr('include');
                    const localPath = this.Path + '.' + include;
                    let result = {};
                    result['id'] = this.Path + '.' + include;
                    result['key'] = $(child).attr('name').replace(/(\.\.\.|:)$/,'');
                    let data = await this.valueFromInclude(child);
                    if (data['id']) {
                        r.push(data)
                    } else {
                        const table = $(data).find('table')[0];
                        const values = $(table).find('value');
                        const value = values[Math.floor(Math.random() * values.length)];
                        document.RandomEverythingGeneratorData[localPath] = value.textContent;
                        result['value'] = value.textContent;
                        r.push(result);
                    }
                    break;
                }
            }
        }

        return r;
    }

    async getData(options) {
        if (!this.Members.length) {
            let doc = $.parseXML(this.XML);
            let memberNodes = $(doc).find('member');
            for (const member of memberNodes) {
                this.Members[$(member).attr('include')] = $(member).attr('name');
            }
        }

        await this.loadMembers();
        let tableResults = await this.populateCategory();


        return {
            title: this.Title,
            xml: this.XML,
            appid: this.id,
            path: this.Path,
            markov: this.Markov,
            data: "test",
            owner: game.user.id,
            members: this.Members,
            linkedMembers: this.LinkedMembers,
            tableResults: tableResults
        };
    }

    onMemberClick(member) {
        let regChild = new REGChild(member.label)
        regChild.XML = member.xml;
        regChild.Path = member.path
        regChild.Markov = this.Markov;
        regChild.render(true);
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(`#${this.id}-add-member`).change(ev => this.addMember(html));

        for (let member of this.LinkedMembers) {
            html.find(`#${this.id}-member-${member.index}`).click(ev => {
                this.onMemberClick(member)
            });
        }

        for (let path of Object.keys(this.RegenCallbacks)) {
            const span = document.getElementById(`reg-regen-${path}`);
            $(span).click(this.RegenCallbacks[path]);
        }

        for (let path of Object.keys(this.DropdownCallbacks)) {
            const a = document.getElementById(`reg-dd-${path}`);
            $(a).click(this.DropdownCallbacks[path]);
        }

        for (let path of Object.keys(this.DeleteCallbacks)) {
            const a = document.getElementById(`reg-delete-${path}`);
            $(a).click(this.DeleteCallbacks[path]);
        }

        for (let id of Object.keys(this.OpenChildCallBacks)) {
            const a = document.getElementById(id);
            $(a).click(this.OpenChildCallBacks[id]);
        }
    }

    nextMemberIndex(base) {
        let idx = 0;
        let re = new RegExp(base + '(\\d+)');
        for (let key of Object.keys(document.RandomEverythingGeneratorData)) {
            let m = key.match(re)
            if (m) {
                idx = Math.max(idx, parseInt(m[1])+1);
            }
        }
        return idx;
    }

    addMember(html) {
        let index = this.nextMemberIndex(this.Path + '._member.');
        let path = this.Path + '._member.'+index;
        let markov = this.Markov;
        let option = html.find(`#${this.id}-add-member option:selected`);
        let div = document.createElement('DIV');
        $(div).addClass('reg-member')
        let container = html.find(`#${this.id}-members-list`);
        container.append(div);
        $.ajax({
            url: `/modules/random-everything-generator/xml/${option.val()}.xml`,
            dataType: 'text',
            success: xmlStr => {
                let xml = $.parseXML(xmlStr)
                if ($(xml).find('categories').length > 0) {
                    // Prompt user for a category selection
                    const categories = $(xml).find('categories')[0];
                    // This is a container for other categories
                            
                    let reg = new RandomEverythingGenerator();
                    for (const cat of categories.children) {
                        reg.Choices[$(cat).attr('id')] = $(cat).attr('name')
                    }
                    reg.XML = this.xmlToString(xml);
                    reg.Categories = $(xml).find('categories');
                    reg.Path = path;
                    reg.OnLoadChildCallback = (container, name, file, srcXml) => {
                        container.Path = path;
                        $(div).text(name);
                        $(div).click(ev => {
                            let member = {
                                index,
                                label: name,
                                xml: srcXml,
                                path: path + '.' + file
                            }
                            this.onMemberClick(member)
                        })
                    }
                    reg.render(true);
                } else {
                    $(div).text(option.text());
                    $(div).click(ev => {
                        let member = {
                            index,
                            label: option.text(),
                            xml: xmlStr,
                            path: path + '.' + option.val()
                        }
                        this.onMemberClick(member)
                    })
                    let regChild = new REGChild(option.text())
                    regChild.XML = xmlStr;
                    regChild.Path = path + '.' + option.val();
                    regChild.Markov = markov;
                    regChild.render(true);
                }
            }
        });
    }
}